<!-- Shown instead of the board while the server cannot be reached on load. The app retries on its own. -->
<div class="panel down" role="alert">
  <!-- The page tries to plug its network cable (RJ45) into the server, misses, sulks, and tries again. Without
       animations (reduced motion), the base styles show the missed attempt as a still picture. -->
  <svg viewBox="0 0 216 86" width="216" height="86" aria-hidden="true">
    <!-- Cable: a sagging curve stretched to the plug (scale X) and pulled taut on contact (scale Y). -->
    <path class="cable" d="M66 61 Q75 71 84 61" />
    <!-- RJ45 plug seen from above, ink only: boot, body, contacts at the tip. -->
    <g class="plug">
      <path class="boot" d="M84 58.5h4l3-1.5v8l-3-1.5h-4z" />
      <rect class="body" x="91" y="55" width="13" height="12" rx="1.5" />
      <path class="contacts" d="M98 58.5h3M98 61h3M98 63.5h3" />
    </g>
    <g class="browser">
      <rect x="10" y="20" width="60" height="46" rx="6" />
      <line x1="10" y1="31" x2="70" y2="31" />
      <rect class="eye" x="31" y="42" width="4" height="5" />
      <rect class="eye" x="45" y="42" width="4" height="5" />
      <path class="mouth happy" d="M33 52 Q40 57 47 52" />
      <path class="mouth sad" d="M33 56 Q40 51 47 56" />
    </g>
    <g class="server">
      <rect x="150" y="16" width="56" height="26" rx="5" />
      <rect x="150" y="48" width="56" height="26" rx="5" />
      <line x1="160" y1="29" x2="176" y2="29" />
      <line x1="160" y1="61" x2="176" y2="61" />
      <circle class="led" cx="194" cy="29" r="3.5" />
      <circle class="led" cx="194" cy="61" r="3.5" />
      <rect class="socket" x="143" y="54" width="9" height="14" rx="1.5" />
    </g>
    <g class="cross">
      <line x1="120" y1="30" x2="132" y2="42" />
      <line x1="132" y1="30" x2="120" y2="42" />
    </g>
  </svg>
  <h1>Petit souci technique</h1>
  <p>Le serveur ne répond pas pour le moment. On réessaie tout seuls, pas besoin de recharger la page.</p>
  <p class="retry">Nouvel essai en cours<span class="dots" aria-hidden="true">…</span></p>
</div>

<style>
  .down {
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(340px, calc(100vw - 48px));
    padding: 24px;
    text-align: center;
    line-height: 1.5;
  }
  svg {
    display: block;
    margin: 0 auto 12px;
    max-width: 100%;
    height: auto;
    overflow: visible;
  }

  /* Drawing. Base values are the missed attempt (the still picture); animations play the loop. */
  .browser rect:first-child,
  .server rect:not(.socket) {
    fill: var(--paper);
    stroke: var(--ink);
    stroke-width: 3;
  }
  .browser line,
  .server line {
    stroke: var(--ink);
    stroke-width: 3;
    stroke-linecap: round;
  }
  .eye,
  .boot {
    fill: var(--ink);
  }
  .mouth {
    fill: none;
    stroke: var(--ink);
    stroke-width: 2.5;
    stroke-linecap: round;
  }
  .happy {
    opacity: 0;
  }
  .cable {
    fill: none;
    stroke: var(--ink);
    stroke-width: 3.5;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
    transform-box: view-box;
    transform-origin: 66px 61px;
    transform: scale(2.56, 1);
  }
  .plug {
    transform: translateX(28px);
  }
  .body {
    fill: var(--paper);
    stroke: var(--ink);
    stroke-width: 3;
  }
  .contacts {
    stroke: var(--ink);
    stroke-width: 1.5;
    stroke-linecap: round;
  }
  .socket {
    stroke: var(--ink);
    stroke-width: 3;
  }
  .socket,
  .led {
    fill: var(--red);
  }
  .cross {
    stroke: var(--red);
    stroke-width: 4;
    stroke-linecap: round;
  }

  /* One 3 s loop: reach for the server (0-45 %), touch and fail (52 %), back off, rest, retry. */
  .plug,
  .cable,
  .happy,
  .sad,
  .socket,
  .led,
  .cross {
    animation-duration: 3s;
    animation-iteration-count: infinite;
  }
  .plug {
    animation-name: plug;
    animation-timing-function: ease-in-out;
  }
  .cable {
    animation-name: cable;
    animation-timing-function: ease-in-out;
  }
  .happy {
    animation-name: happy;
    animation-timing-function: steps(1);
  }
  .sad {
    animation-name: sad;
    animation-timing-function: steps(1);
  }
  .socket {
    animation-name: socket;
    animation-timing-function: steps(1);
  }
  .led {
    animation-name: led;
    animation-timing-function: steps(1);
  }
  .cross {
    transform-box: fill-box;
    transform-origin: center;
    animation-name: cross;
  }
  @keyframes plug {
    0%,
    92%,
    100% {
      transform: translateX(0);
    }
    45% {
      transform: translateX(37px);
    }
    52% {
      transform: translateX(39px);
    }
    58% {
      transform: translateX(28px);
    }
    75% {
      transform: translateX(30px);
    }
  }
  /* Scale X = (18 + plug offset) / 18 keeps the cable's end on the plug; scale Y < 1 pulls it taut. */
  @keyframes cable {
    0%,
    92%,
    100% {
      transform: scale(1, 1);
    }
    45% {
      transform: scale(3.06, 0.9);
    }
    52% {
      transform: scale(3.17, 0.3);
    }
    58% {
      transform: scale(2.56, 1);
    }
    75% {
      transform: scale(2.67, 1);
    }
  }
  @keyframes happy {
    0% {
      opacity: 1;
    }
    52% {
      opacity: 0;
    }
    88% {
      opacity: 1;
    }
  }
  @keyframes sad {
    0% {
      opacity: 0;
    }
    52% {
      opacity: 1;
    }
    88% {
      opacity: 0;
    }
  }
  @keyframes socket {
    0% {
      fill: var(--paper);
    }
    52% {
      fill: var(--red);
    }
    88% {
      fill: var(--paper);
    }
  }
  @keyframes led {
    0% {
      fill: var(--ink);
    }
    52% {
      fill: var(--red);
    }
    88% {
      fill: var(--ink);
    }
  }
  @keyframes cross {
    0%,
    50%,
    88%,
    100% {
      opacity: 0;
      transform: scale(0.3);
    }
    54% {
      opacity: 1;
      transform: scale(1.2);
    }
    58%,
    84% {
      opacity: 1;
      transform: scale(1);
    }
  }

  h1 {
    margin: 0 0 8px;
    font-size: 17px;
    font-weight: 600;
  }
  p {
    margin: 0;
    font-weight: 400;
    color: var(--muted-foreground);
  }
  .retry {
    margin-top: 12px;
    font-size: 12px;
    color: var(--muted-foreground);
  }
  .dots {
    animation: blink 1.4s steps(2) infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0.2;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .plug,
    .cable,
    .happy,
    .sad,
    .socket,
    .led,
    .cross,
    .dots {
      animation: none;
    }
  }
</style>
