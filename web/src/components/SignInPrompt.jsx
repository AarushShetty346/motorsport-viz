// Shown in place of a form when Google sign-in is on and nobody is signed in.
export default function SignInPrompt({ children }) {
  return (
    <div className="signin-prompt">
      <p>{children}</p>
      <a className="btn btn-primary btn-sm" href="/api/auth/google">Sign in with Google</a>
    </div>
  );
}
