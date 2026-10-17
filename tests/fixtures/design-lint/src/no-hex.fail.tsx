export function Fail() {
  return (
    <div>
      <p style={{ color: '#1d1d1f' }}>Ink</p> {/* expect */}
      <svg viewBox="0 0 10 10">
        <circle fill="#d9620a" r="5" /> {/* expect */}
        <line stroke={'#0A5FD9'} /> {/* expect */}
        <stop stopColor="#cedff7" /> {/* expect */}
      </svg>
      <span className="bg-[#fff]">White</span> {/* expect */}
      <span className={`text-[#000] ${'p-1'}`}>Black</span> {/* expect */}
    </div>
  );
}
