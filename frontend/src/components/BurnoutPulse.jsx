function BurnoutPulse({ level }) {
  if (level === "none") return <span className="burnout-pill none">Stable</span>;
  return <span className={`burnout-pill ${level}`}>{level === "red" ? "High Risk" : "Watch"}</span>;
}

export default BurnoutPulse;
