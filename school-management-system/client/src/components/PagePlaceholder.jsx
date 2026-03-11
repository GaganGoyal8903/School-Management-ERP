export default function PagePlaceholder({ title, description }) {
  return (
    <section className="min-h-screen bg-transparent p-4 md:p-6">
      <div className="page-card mx-auto max-w-5xl p-6">
        <h1 className="text-2xl font-bold text-[#002366]">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {description || "This module is ready for backend integration and data wiring."}
        </p>
      </div>
    </section>
  );
}
