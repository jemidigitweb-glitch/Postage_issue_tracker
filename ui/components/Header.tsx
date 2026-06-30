export default function Header() {
  return (
    <header className="w-full px-6 py-16 text-center border-b border-aios-border">
      <div className="max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2.5 bg-aios-surface border border-aios-border rounded-full px-4 py-1.5 mb-10 text-sm text-aios-muted">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block shrink-0" />
          LEDSone · Postage Department
        </div>

        <h1 className="text-5xl md:text-6xl font-bold text-aios-primary mb-4 tracking-tight">
          Postage AIOS
        </h1>

        <p className="text-xl text-aios-accent font-medium mb-6">
          AI Knowledge Hub for the Postage Team
        </p>

        <p className="text-base text-aios-muted max-w-xl mx-auto leading-relaxed">
          Browse the AIOS knowledge base using simple visual categories.
          This website is designed for easy navigation and understanding
          without requiring technical knowledge.
        </p>
      </div>
    </header>
  );
}
