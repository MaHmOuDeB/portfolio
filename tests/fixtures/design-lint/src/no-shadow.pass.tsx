// A comment about boxShadow: '0 1px 4px' is never seen.
export function Pass() {
  return (
    <div>
      <p style={{ boxShadow: 'none', width: 10 }}>Flat</p>
      <p style={{ textShadow: 'none' }}>Flat text</p>
      <p style={{ filter: 'blur(2px)' }}>Blur is not a shadow</p>
      <p style={{ width: `${width}px`, height: 4 }}>Size</p>
      <p className="shadow-note">Class names are the compiled CSS pass's business</p>
    </div>
  );
}
