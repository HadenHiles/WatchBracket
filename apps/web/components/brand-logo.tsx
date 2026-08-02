import Image from 'next/image';

export function BrandLogo({ label }: { label?: string }) {
  return <header className="brand-lockup">
    <a className="app-logo" href="/" aria-label="Watch Bracket home">
      <Image src="/brand/watch-bracket-wordmark.png" alt="Watch Bracket" fill priority sizes="(max-width: 520px) 68vw, 300px"/>
    </a>
    {label&&<span className="brand-context">{label}</span>}
  </header>;
}
