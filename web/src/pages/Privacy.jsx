import { Link } from '../lib/router.jsx';

// Plain-language privacy policy, linked from the footer and the Google consent screen.
export default function Privacy() {
  return (
    <section className="page container me-page privacy-page">
      <p className="eyebrow">Last updated 9 November 2026</p>
      <h1 className="display-xl">Privacy</h1>
      <p className="lede">Lap by Lap is a personal portfolio project. You can browse every page without an account. This page explains what is stored if you choose to sign in.</p>

      <h2 className="h-small">What is stored when you sign in with Google</h2>
      <ul>
        <li>Your name, email address and profile picture from Google, and Google's account ID, so the site knows who you are.</li>
        <li>A sign-in cookie that keeps you signed in for up to 30 days. Only a scrambled (hashed) copy of it is kept on the server.</li>
        <li>Any notes you write on race pages, with your name on them.</li>
      </ul>
      <p>Lap by Lap only asks Google for your basic profile and email. It cannot see your Gmail, contacts, Drive or anything else in your Google account.</p>

      <h2 className="h-small">Who can see your notes</h2>
      <p>A new note is visible only to you until the site owner reviews it. If it is approved, everyone can read it, together with your name. Your email address is never shown publicly.</p>

      <h2 className="h-small">Stored only in your browser</h2>
      <p>Steward mode changes and a few display preferences are saved in your browser's local storage. They never leave your device, and clearing your browser data removes them.</p>

      <h2 className="h-small">What does not happen</h2>
      <ul>
        <li>No ads, no analytics or tracking scripts, and no selling or sharing of your data.</li>
        <li>No payment details or passwords are collected.</li>
      </ul>

      <h2 className="h-small">Where it is kept</h2>
      <p>The site runs on Render and the data is stored in a MongoDB Atlas database, both hosted in Singapore.</p>

      <h2 className="h-small">Removing your data</h2>
      <p>You can delete any of your notes yourself from the race page or from <Link to="/me">My activity</Link>. To have your account removed completely, contact the site owner through <a href="https://github.com/AarushShetty346">GitHub</a> and everything linked to it will be deleted. You can also remove Lap by Lap's access at any time from your Google account's security settings.</p>

      <h2 className="h-small">Changes</h2>
      <p>If this policy changes, the date at the top of this page will be updated.</p>
    </section>
  );
}
