import { navItems, operations, site, competitors } from "../lib/content";
import { WaitlistForm } from "./waitlist-form";

function Header() {
  return (
    <header className="site-header">
      <a className="brand-link" href="#top" aria-label="Flowstate home">
        Flowstate
      </a>
      <nav aria-label="Primary navigation">
        {navItems.map((item) => (
          <a href={item.href} key={item.href}>
            {item.label}
          </a>
        ))}
      </nav>
      <a className="header-cta" href="#waitlist">
        Join Waitlist
      </a>
    </header>
  );
}

function ProductPlaceholder() {
  return (
    <div className="product-plane" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function Hero() {
  return (
    <section className="hero" id="top" aria-label="Flowstate landing hero">
      <div className="hero-image" aria-hidden="true" />
      <ProductPlaceholder />
      <div className="hero-content">
        <p className="hero-brand">Flowstate</p>
        <h1>Martial arts gym software reliable enough to disappear.</h1>
        <p>
          Memberships, bookings, waivers, attendance, billing, and parent
          accounts, all moving in rhythm behind the scenes.
        </p>
        <div className="cta-row">
          <a className="button button-primary" href="#waitlist">
            Join Waitlist
          </a>
          <a
            className="button button-secondary"
            href={`mailto:${site.demoEmail}?subject=Flowstate demo request`}
          >
            Book a Demo
          </a>
        </div>
      </div>
    </section>
  );
}

function Reliability() {
  return (
    <section className="content-section reliability-section" id="reliability">
      <p className="section-kicker">Reliability as a feeling</p>
      <h2>The best operations software does not ask to be noticed.</h2>
      <p>
        Flowstate is designed for the quiet parts of owning a martial arts gym:
        knowing tomorrow&apos;s schedule is clean, knowing attendance was
        captured, knowing billing is understandable, and knowing members can
        handle the basics without another front-desk interruption.
      </p>
    </section>
  );
}

function Operations() {
  return (
    <section className="content-section operations-section" id="operations">
      <div>
        <p className="section-kicker">Daily loops</p>
        <h2>Built around the work your gym repeats every day.</h2>
      </div>
      <ul className="operations-list">
        {operations.map((operation) => (
          <li key={operation}>{operation}</li>
        ))}
      </ul>
    </section>
  );
}

function FoundingGym() {
  return (
    <section className="founding-section" id="founding-gym">
      <div>
        <p className="section-kicker">Founding Gym pricing</p>
        <h2>Join early. Keep the advantage.</h2>
      </div>
      <p>
        Gyms that join the waitlist and onboard during the founding window get
        15% off monthly pricing, grandfathered after Flowstate launches at full
        price.
      </p>
      <a className="button button-primary" href="#waitlist">
        Claim Founding Gym access
      </a>
    </section>
  );
}

function Alternatives() {
  const competitorList = competitors.slice(0, 8).join(", ");

  return (
    <section className="content-section alternatives-section" id="alternatives">
      <p className="section-kicker">For owners comparing options</p>
      <h2>A calmer replacement path for martial arts gym software.</h2>
      <p>
        If you are researching alternatives to older gym management tools,
        Flowstate is being built for martial arts operators who want reliable
        scheduling, billing clarity, member self-service, and parent-account
        support without dragging a generic fitness system into a striking gym.
      </p>
      <p className="answer-copy">
        Flowstate is relevant for searches around alternatives to {competitorList},
        and other gym management platforms when the real requirement is a calm
        operating system for Muay Thai, kickboxing, boxing, MMA, and martial arts
        schools.
      </p>
    </section>
  );
}

function Footer() {
  return (
    <footer className="site-footer" id="footer">
      <strong>Flowstate</strong>
      <p>Reliable martial arts gym operations, designed to disappear.</p>
      <div>
        <a href="#reliability">Reliability</a>
        <a href="#founding-gym">Founding Gyms</a>
        <a href={`mailto:${site.demoEmail}`}>Contact</a>
      </div>
    </footer>
  );
}

export default function Home() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: site.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: site.description,
    offers: {
      "@type": "Offer",
      description:
        "Founding gyms receive 15% off monthly pricing, grandfathered after launch.",
    },
    audience: {
      "@type": "Audience",
      audienceType: "Martial arts gym owners",
    },
  };

  return (
    <>
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        type="application/ld+json"
      />
      <Header />
      <main>
        <Hero />
        <Reliability />
        <Operations />
        <FoundingGym />
        <section className="waitlist-section" id="waitlist">
          <WaitlistForm />
        </section>
        <Alternatives />
      </main>
      <Footer />
    </>
  );
}
