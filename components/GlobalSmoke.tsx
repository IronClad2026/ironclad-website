export default function GlobalSmoke() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[5] h-[100dvh] w-screen overflow-hidden opacity-[0.18] motion-reduce:hidden"
    >
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="absolute inset-0 block h-full w-full object-cover object-center"
      >
        <source src="/effects/smoke.webm" type="video/webm" />
      </video>
    </div>
  );
}
