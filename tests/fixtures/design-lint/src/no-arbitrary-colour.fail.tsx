export function Fail() {
  return (
    <div>
      <svg viewBox="0 0 10 10">
        <rect fill="red" stroke="rgb(255,0,0)" width="10" height="10" /> {/* expect */}
        <circle fill={'rebeccapurple'} r="5" /> {/* expect */}
        <line stroke="hsl(10 20% 30%)" /> {/* expect */}
        <stop stopColor="oklch(60% 0.2 30)" /> {/* expect */}
        <feFlood floodColor="color-mix(in srgb, red, blue)" /> {/* expect */}
        <feDiffuseLighting lightingColor="Navy" /> {/* expect */}
        <path color="rgba(0, 0, 0, 0.5)" /> {/* expect */}
      </svg>
      <p style={{ color: 'red' }}>Red</p> {/* expect */}
      <p style={{ backgroundColor: 'rgb(0 0 0)' }}>Black</p> {/* expect */}
      <p style={{ border: '1px solid blue' }}>Border</p> {/* expect */}
      <p style={{ width: 4, outlineColor: 'hsla(0, 0%, 0%, 0.5)' }}>Outline</p> {/* expect */}
    </div>
  );
}
