#!/usr/bin/env python3
"""Builds data/season-2025.json.gz: the real 2025 Formula 1 season.

Sources (both free to reuse):
  * F1DB (https://github.com/f1db/f1db, CC BY 4.0): calendar, circuits,
    drivers, race + sprint classifications and points.
  * TracingInsights 2025 archive (https://github.com/TracingInsights/2025,
    Apache-2.0, built from the official F1 live-timing feed via FastF1):
    every lap of every Grand Prix, plus the car telemetry of every lap,
    which is summarised here into top speed, peak RPM, throttle, braking, DRS.

The circuit maps are the car's real X/Y position trace on the race's fastest lap.

Usage:  python3 scripts/build_season.py [--cache DIR]
Needs:  Python 3.9+ and PyYAML (pip install pyyaml). Downloads ~4 GB of
        telemetry once (takes 10-20 minutes); the output is ~2 MB.
"""
import argparse
import gzip
import json
import math
import os
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import yaml

F1DB = 'https://raw.githubusercontent.com/f1db/f1db/main/src/data'
TI = 'https://raw.githubusercontent.com/TracingInsights/2025/main'

# (round, F1DB race folder, TracingInsights event folder)
CALENDAR = [
    (1, '01-australia', 'Australian Grand Prix'),
    (2, '02-china', 'Chinese Grand Prix'),
    (3, '03-japan', 'Japanese Grand Prix'),
    (4, '04-bahrain', 'Bahrain Grand Prix'),
    (5, '05-saudi-arabia', 'Saudi Arabian Grand Prix'),
    (6, '06-miami', 'Miami Grand Prix'),
    (7, '07-emilia-romagna', 'Emilia Romagna Grand Prix'),
    (8, '08-monaco', 'Monaco Grand Prix'),
    (9, '09-spain', 'Spanish Grand Prix'),
    (10, '10-canada', 'Canadian Grand Prix'),
    (11, '11-austria', 'Austrian Grand Prix'),
    (12, '12-great-britain', 'British Grand Prix'),
    (13, '13-belgium', 'Belgian Grand Prix'),
    (14, '14-hungary', 'Hungarian Grand Prix'),
    (15, '15-netherlands', 'Dutch Grand Prix'),
    (16, '16-italy', 'Italian Grand Prix'),
    (17, '17-azerbaijan', 'Azerbaijan Grand Prix'),
    (18, '18-singapore', 'Singapore Grand Prix'),
    (19, '19-united-states', 'United States Grand Prix'),
    (20, '20-mexico', 'Mexico City Grand Prix'),
    (21, '21-sao-paulo', 'São Paulo Grand Prix'),
    (22, '22-las-vegas', 'Las Vegas Grand Prix'),
    (23, '23-qatar', 'Qatar Grand Prix'),
    (24, '24-abu-dhabi', 'Abu Dhabi Grand Prix'),
]

TRACK_POINTS = 480  # points kept for each circuit outline


def fetch(url, retries=4):
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            err = e
        except Exception as e:  # network hiccup: retry
            err = e
    raise RuntimeError(f'{url}: {err}')


def fetch_yaml(path):
    raw = fetch(f'{F1DB}/{path}')
    return yaml.safe_load(raw) if raw else None


def ti_url(event, *parts):
    return '/'.join([TI, urllib.parse.quote(event), 'Race', *[urllib.parse.quote(p) for p in parts]])


def num(v):
    if v is None or v == 'None' or (isinstance(v, float) and math.isnan(v)):
        return None
    return v


def summarise_tel(tel):
    """Reduces one lap of car telemetry to per-lap figures."""
    t = tel['time']
    n = len(t)
    if n < 20:
        return None
    dts = [max(0.0, t[i + 1] - t[i]) for i in range(n - 1)] + [0.0]
    total = sum(dts) or 1.0

    def share(pred):
        return 100.0 * sum(dt for dt, ok in zip(dts, pred) if ok) / total

    speed = [s for s in tel['speed'] if isinstance(s, (int, float))]
    rpm = [r for r in tel['rpm'] if isinstance(r, (int, float))]
    thr = [min(100.0, max(0.0, x)) if isinstance(x, (int, float)) else 0.0 for x in tel['throttle']]
    brake = [bool(b) and b not in ('None', 0) for b in tel['brake']]
    drs = [isinstance(d, (int, float)) and d >= 10 for d in tel['drs']]
    gears = [g for g in tel['gear'] if isinstance(g, (int, float))]
    if not speed or not rpm:
        return None
    return {
        'speed': round(max(speed), 1),
        'avgSpeed': round(sum(s * dt for s, dt in zip(tel['speed'], dts) if isinstance(s, (int, float))) / total, 1),
        'rpm': int(round(max(rpm))),
        'throttle': round(sum(x * dt for x, dt in zip(thr, dts)) / total, 1),
        'brake': round(share(brake), 1),
        'drs': round(share(drs), 1),
        'gear': int(max(gears)) if gears else None,
    }


def track_from_tel(tel):
    """Resamples the car's X/Y trace to evenly spaced points along the lap."""
    xs, ys, sp, dist = tel['x'], tel['y'], tel['speed'], tel['distance']
    pts = [(d, x, y, s) for d, x, y, s in zip(dist, xs, ys, sp)
           if all(isinstance(v, (int, float)) for v in (d, x, y, s))]
    pts.sort()
    if len(pts) < 50:
        return None
    lap_len = pts[-1][0]
    out, j = [], 0
    for k in range(TRACK_POINTS):
        target = lap_len * k / TRACK_POINTS
        while j < len(pts) - 2 and pts[j + 1][0] < target:
            j += 1
        d0, x0, y0, s0 = pts[j]
        d1, x1, y1, s1 = pts[j + 1]
        f = 0 if d1 == d0 else min(1, max(0, (target - d0) / (d1 - d0)))
        out.append((x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, s0 + (s1 - s0) * f))
    return {
        'x': [round(p[0]) for p in out],
        'y': [round(p[1]) for p in out],
        'speed': [round(p[2]) for p in out],
        'length': round(lap_len),
    }


def classification(rows):
    if not rows:
        return None
    out = []
    for r in rows:
        out.append({
            'position': r.get('position') if isinstance(r.get('position'), int) else None,
            'positionText': str(r.get('position')),
            'driver': r['driverId'],
            'number': r.get('driverNumber'),
            'constructor': r.get('constructorId'),
            'grid': r.get('gridPosition') if isinstance(r.get('gridPosition'), int) else None,
            'laps': r.get('laps'),
            'time': r.get('time'),
            'gap': r.get('gap'),
            'retired': r.get('reasonRetired'),
            'points': r.get('points') or 0,
        })
    return out


def build_race(rnd, slug, event, cache_dir, pool):
    cache_file = os.path.join(cache_dir, f'{rnd:02d}.json') if cache_dir else None
    if cache_file and os.path.exists(cache_file):
        with open(cache_file) as f:
            return json.load(f)

    race = fetch_yaml(f'seasons/2025/races/{slug}/race.yml')
    gp = fetch_yaml(f'grands-prix/{race["grandPrixId"]}.yml')
    circuit = fetch_yaml(f'circuits/{race["circuitId"]}.yml')
    country = fetch_yaml(f'countries/{circuit["countryId"]}.yml')
    results = fetch_yaml(f'seasons/2025/races/{slug}/race-results.yml')
    sprint = fetch_yaml(f'seasons/2025/races/{slug}/sprint-race-results.yml')

    ti_drivers = json.loads(fetch(ti_url(event, 'drivers.json')))['drivers']
    corners = json.loads(fetch(ti_url(event, 'corners.json')) or b'null')

    # Every lap of every driver, then the telemetry of each lap in parallel.
    lap_rows = []
    for d in ti_drivers:
        raw = fetch(ti_url(event, d['driver'], 'laptimes.json'))
        if not raw:
            continue
        lt = json.loads(raw)
        for i, lap_no in enumerate(lt['lap']):
            lap_rows.append({
                'code': d['driver'],
                'number': int(d['dn']),
                'lapNumber': int(lap_no),
                'lapTime': num(lt['time'][i]),
                'position': num(lt['pos'][i]),
                'compound': num(lt['compound'][i]),
                'stint': num(lt['stint'][i]),
                'tyreLife': num(lt['life'][i]),
                'pitIn': num(lt['pin'][i]) is not None,
                'pitOut': num(lt['pout'][i]) is not None,
                'sectors': [num(lt['s1'][i]), num(lt['s2'][i]), num(lt['s3'][i])],
                'speedTrap': num(lt['vst'][i]),
                'deleted': bool(lt['del'][i]),
            })

    def load_tel(row):
        raw = fetch(ti_url(event, row['code'], f'{row["lapNumber"]}_tel.json'))
        return json.loads(raw)['tel'] if raw else None

    tels = list(pool.map(load_tel, lap_rows))

    laps, fastest = [], None
    skipped = 0
    for row, tel in zip(lap_rows, tels):
        summary = summarise_tel(tel) if tel else None
        if row['lapTime'] is None or summary is None:
            skipped += 1
            continue
        row['telemetry'] = summary
        laps.append(row)
        if not row['pitIn'] and not row['pitOut'] and (fastest is None or row['lapTime'] < fastest[0]['lapTime']):
            fastest = (row, tel)

    track = track_from_tel(fastest[1]) if fastest else None
    if track:
        track['lap'] = {'code': fastest[0]['code'], 'lapNumber': fastest[0]['lapNumber'], 'lapTime': fastest[0]['lapTime']}

    out = {
        'round': rnd,
        'name': gp['fullName'],
        'shortName': gp['shortName'],
        'abbreviation': gp['abbreviation'],
        'officialName': race['officialName'],
        'date': str(race['date']),
        'time': str(race.get('time') or ''),
        'circuit': circuit['name'],
        'circuitFullName': circuit['fullName'],
        'circuitType': race.get('circuitType'),
        'direction': race.get('direction'),
        'locality': circuit['placeName'],
        'country': country['name'],
        'countryCode': country['alpha2Code'],
        'lat': circuit['latitude'],
        'lng': circuit['longitude'],
        'laps': race['laps'],
        'courseLength': race['courseLength'],
        'distance': race['distance'],
        'turns': race['turns'],
        'results': classification(results),
        'sprint': classification(sprint),
        'track': track,
        'corners': [
            {'number': n, 'x': round(x), 'y': round(y)}
            for n, x, y in zip(corners['CornerNumber'], corners['X'], corners['Y'])
        ] if corners else [],
        'drivers': [{'code': d['driver'], 'number': int(d['dn']), 'team': d['team'], 'teamColor': '#' + d['tc'],
                     'firstName': d['fn'], 'lastName': d['ln']} for d in ti_drivers],
        'lapRows': laps,
    }
    print(f'  round {rnd:2d} {gp["fullName"]:<28} {len(laps):5d} laps ({skipped} without timing/telemetry)', flush=True)
    if cache_file:
        with open(cache_file, 'w') as f:
            json.dump(out, f)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', help='directory to cache per-race results in (lets a re-run resume)')
    ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', 'data', 'season-2025.json.gz'))
    args = ap.parse_args()
    if args.cache:
        os.makedirs(args.cache, exist_ok=True)

    print('Building the 2025 season...', flush=True)
    with ThreadPoolExecutor(max_workers=32) as pool:
        races = [build_race(r, s, e, args.cache, pool) for r, s, e in CALENDAR]

    # Drivers: every driver who started a Grand Prix, keyed by F1DB id.
    number_to_key = {}
    for race in races:
        for res in race['results']:
            number_to_key[(race['round'], res['number'])] = res['driver']
    driver_keys = []
    for race in races:
        for res in race['results'] + (race['sprint'] or []):
            if res['driver'] not in driver_keys:
                driver_keys.append(res['driver'])

    drivers = {}
    for key in driver_keys:
        info = fetch_yaml(f'drivers/{key}.yml')
        nat = fetch_yaml(f'countries/{info["nationalityCountryId"]}.yml')
        drivers[key] = {
            'key': key,
            'code': info['abbreviation'],
            'name': info['name'],
            'firstName': info['firstName'],
            'lastName': info['lastName'],
            'number': info.get('permanentNumber'),
            'nationality': nat['demonym'],
            'countryCode': nat['alpha2Code'],
            'dateOfBirth': str(info['dateOfBirth']),
        }
    # Team, colour and race number: as raced most recently in 2025
    # (F1DB's permanentNumber is a driver's current number, which can differ).
    for race in races:
        for d in race['drivers']:
            key = number_to_key.get((race['round'], d['number']))
            if key in drivers:
                drivers[key].update(team=d['team'], teamColor=d['teamColor'], number=d['number'])

    laps = []
    for race in races:
        for row in race.pop('lapRows'):
            key = number_to_key.get((race['round'], row['number']))
            if not key:
                continue
            row.pop('code')
            row.pop('number')
            laps.append({'driver': key, 'round': race['round'], **row})
        race.pop('drivers')

    out = {
        'season': 2025,
        'sources': {
            'results': 'F1DB, https://github.com/f1db/f1db (CC BY 4.0)',
            'laps': 'TracingInsights 2025 archive, https://github.com/TracingInsights/2025 (Apache-2.0), from the F1 live-timing feed via FastF1',
        },
        'drivers': list(drivers.values()),
        'races': races,
        'laps': laps,
    }
    with gzip.open(args.out, 'wt', encoding='utf-8') as f:
        json.dump(out, f, separators=(',', ':'), ensure_ascii=False)
    print(f'Wrote {args.out}: {len(drivers)} drivers, {len(races)} races, {len(laps)} laps')


if __name__ == '__main__':
    sys.exit(main())
