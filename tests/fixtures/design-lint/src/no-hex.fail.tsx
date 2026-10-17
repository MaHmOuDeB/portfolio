const button = cva('px-2', { variants: { tone: { brand: 'bg-[#d9620a] text-ink' } } }); // expect
const ring = 'focus-visible:ring-[#0a5fd9]'; // expect
const fill = `fill-[rgb(0_0_0)] ${'p-1'}`; // expect
const stops = ['from-[#cedff7]', 'to-bg']; // expect

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
