"""Builds data/profiles.json: career facts for every 2025 driver and team.

Source: F1DB (https://github.com/f1db/f1db, CC BY 4.0) - driver details,
championship standings and team line-ups for every season since 1950.
Usage: python3 scripts/build_profiles.py
"""
import gzip, json, os, urllib.request
import yaml  # pip install pyyaml

F1DB = 'https://raw.githubusercontent.com/f1db/f1db/main/src/data'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIRST, LAST = 1950, 2025

def get(path):
    with urllib.request.urlopen(f'{F1DB}/{path}', timeout=60) as r:
        return yaml.safe_load(r.read().decode('utf-8')) or []

season = json.load(gzip.open(os.path.join(ROOT, 'data', 'season-2025.json.gz')))
drivers = [d['key'] for d in season['drivers']]

# Every constructor a 2025 team has raced as (the same factory under older names).
LINEAGE = {
    'mclaren': ['mclaren'],
    'ferrari': ['ferrari'],
    'red-bull': ['red-bull', 'jaguar', 'stewart'],
    'mercedes': ['mercedes', 'brawn', 'honda', 'bar'],
    'williams': ['williams'],
    'aston-martin': ['aston-martin', 'racing-point', 'force-india', 'spyker', 'mf1', 'midland', 'jordan'],
    'racing-bulls': ['rb', 'racing-bulls', 'alphatauri', 'toro-rosso', 'minardi'],
    'haas': ['haas'],
    'kick-sauber': ['kick-sauber', 'alfa-romeo', 'sauber', 'bmw-sauber'],
    'alpine': ['alpine', 'renault', 'lotus-f1', 'benetton', 'toleman'],
}
owner = {c: team for team, ids in LINEAGE.items() for c in ids}

out_drivers = {k: {'seasons': [], 'teams': []} for k in drivers}
out_teams = {t: {'seasons': [], 'drivers': {}} for t in LINEAGE}
names = {}

for year in range(FIRST, LAST + 1):
    try:
        entrants = get(f'seasons/{year}/entrants.yml')
    except Exception:
        continue
    teams_of = {}
    for e in entrants:
        team = owner.get(e.get('constructorId'))
        for d in e.get('drivers') or []:
            if d.get('testDriver'):
                continue
            did = d['driverId']
            teams_of.setdefault(did, [])
            if e['constructorId'] not in teams_of[did]:
                teams_of[did].append(e['constructorId'])
            if team:
                out_teams[team]['drivers'].setdefault(did, []).append(year)
    if any(teams_of.get(k) for k in drivers):
        for s in get(f'seasons/{year}/driver-standings.yml'):
            if s['driverId'] in out_drivers:
                out_drivers[s['driverId']]['seasons'].append({'year': year, 'position': s.get('position'), 'points': s.get('points'), 'teams': teams_of.get(s['driverId'], [])})
    for s in get(f'seasons/{year}/constructor-standings.yml') if year >= 1958 else []:
        team = owner.get(s['constructorId'])
        if team:
            out_teams[team]['seasons'].append({'year': year, 'position': s.get('position'), 'points': s.get('points'), 'as': s['constructorId']})
    print(year, end=' ', flush=True)

for k, d in out_drivers.items():
    info = get(f'drivers/{k}.yml')
    d.update({'dateOfBirth': str(info.get('dateOfBirth') or ''), 'placeOfBirth': info.get('placeOfBirth'), 'fullName': info.get('fullName')})
    seen = []
    for s in d['seasons']:
        for t in s['teams']:
            if t not in seen:
                seen.append(t)
    d['teams'] = seen
    d['firstSeason'] = d['seasons'][0]['year'] if d['seasons'] else None

def label(did):
    if did not in names:
        try:
            names[did] = get(f'drivers/{did}.yml').get('name') or did
        except Exception:
            names[did] = did.replace('-', ' ').title()
    return names[did]

for t in out_teams.values():
    # Drivers with the most seasons at the team, most recent first on ties.
    ranked = sorted(t['drivers'].items(), key=lambda kv: (-len(set(kv[1])), -max(kv[1])))[:16]
    t['drivers'] = [{'id': did, 'name': label(did), 'seasons': len(set(ys)), 'from': min(ys), 'to': max(ys)} for did, ys in ranked]
    t['titles'] = [s['year'] for s in t['seasons'] if s['position'] == 1]

with open(os.path.join(ROOT, 'data', 'profiles.json'), 'w') as f:
    json.dump({'source': 'F1DB, https://github.com/f1db/f1db (CC BY 4.0)', 'drivers': out_drivers, 'teams': out_teams}, f, separators=(',', ':'))
print('\nwrote data/profiles.json')
