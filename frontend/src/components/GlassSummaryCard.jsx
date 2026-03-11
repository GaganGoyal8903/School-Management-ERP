function GlassSummaryCard({ title, value, note, tone = "", onClick }) {
  return (
    <article
      className={`glass-summary-card ${tone} ${onClick ? "clickable" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(event) => {
        if (!onClick) return;
        if (event.key === "Enter" || event.key === " ") onClick();
      }}
    >
      <p>{title}</p>
      <h3>{value}</h3>
      {note && <span>{note}</span>}
    </article>
  );
}

export default GlassSummaryCard;
