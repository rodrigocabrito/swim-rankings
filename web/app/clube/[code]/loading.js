// Shown instantly while a club page loads — gives immediate feedback.
export default function Loading() {
  return (
    <div>
      <div className="sk sk-back" />
      <div className="club-header">
        <div className="sk sk-logo" />
        <div>
          <div className="sk sk-title" />
          <div className="sk sk-sub" />
        </div>
      </div>
      <div className="sk-row">
        <div className="sk sk-pill" />
        <div className="sk sk-pill" />
        <div className="sk sk-pill" />
      </div>
      <div className="sk sk-card" />
      <div className="sk sk-card" />
    </div>
  );
}
