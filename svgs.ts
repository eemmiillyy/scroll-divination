
const POINTER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 17 22.028">
  <g transform="translate(3.7859e-7 -722.07)">
    <g transform="matrix(.23944 0 0 .23944 94.337 797.27)">
      <path fill="#fefefe" d="m-368.99-226.1v-9h-4v-8h-4v-8h-4v-9h-5v-4h-4v-8h9v4h4v12h4v-54h8v38h4v-17h9v17h4v-13h8v17h4v-13h5v5h4v29h-4v12h-5v9h-33z"/>
      <path fill="#000" d="m-372.99-222.1v-13h-4v-8h-4v-8h-5v-9h-4v-4h-4v-12h13v4h4v-38h4v-4h8v4h4v17h9v4h12v4h9v4h4v5h4v29h-4v12h-4v13h-42zm37-4v-9h5v-12h4v-29h-4v-5h-5v13h-4v-17h-8v13h-4v-17h-9v17h-4v-38h-8v54h-4v-12h-4v-4h-9v8h4v4h5v9h4v8h4v8h4v9h33z"/>
    </g>
  </g>
</svg>
`.trim();

  const WHEEL_SVG = `
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 800 800"
     fill="none"
     stroke="black"
     stroke-width="4"
     stroke-linecap="round"
     stroke-linejoin="round">

  <!-- outer outline -->
  <circle cx="400" cy="400" r="320" />

  <!-- 4 evenly spaced interior lines (diameters) -->
  <line x1="80"  y1="400" x2="720" y2="400" />  <!-- 0° -->
  <line x1="400" y1="80"  x2="400" y2="720" />  <!-- 90° -->

  <!-- 45° and 135° (endpoints on the circle) -->
  <line x1="173.726" y1="173.726" x2="626.274" y2="626.274" />
  <line x1="173.726" y1="626.274" x2="626.274" y2="173.726" />
</svg>
`;

const SPIRAL_SVG = `
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 800 800"
     fill="none"
     stroke="black"
     stroke-width="14"
     stroke-linecap="round"
     stroke-linejoin="round">
  <path d="
    M400 400
    C420 400 440 380 440 360
    C440 320 380 300 340 340
    C280 400 340 500 440 500
    C580 500 640 360 540 260
    C400 120 180 260 220 440
    C260 660 540 720 680 540
    C840 340 620 80 360 120
  "/>
</svg>
`;

  const HEART_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-60 -60 120 120">
  <path d="M0,38
           C-22,20 -50,5 -40,-20
           C-32,-44 -10,-46 0,-28
           C10,-46 32,-44 40,-20
           C50,5 22,20 0,38 Z" />
</svg>`;

  const FISH_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-80 -50 160 100">
  <path d="
    M-55,0
    L-75,-18
    L-62,0
    L-75,18
    Z
  " />
  <path d="
    M-55,0
    C-30,-30 10,-32 45,-10
    C62,0 62,0 45,10
    C10,32 -30,30 -55,0
    Z
  " />
</svg>`;

const STAR_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 95">
  <path
    d="
      M 50 2
      L 61 35
      L 96 35
      L 67 56
      L 78 90
      L 50 70
      L 22 90
      L 33 56
      L 4 35
      L 39 35
      Z
    "
    fill="none"
    stroke="black"
    stroke-width="4"
    stroke-linejoin="round"
  />
</svg>
`;

const CRESCENT_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path
    d="
      M 65 10
      A 45 45 0 1 0 65 90
      A 30 30 0 1 1 65 10
      Z
    "
    fill="none"
    stroke="black"
    stroke-width="4"
    stroke-linejoin="round"
  />
</svg>
`;

const HORSESHOE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 800 800"
     fill="none"
     stroke="black"
     stroke-width="4"
     stroke-linecap="round"
     stroke-linejoin="round">
  <path d="
    M130 80
    H290
    C255 140 235 230 235 330
    C235 520 315 655 400 690
    C485 655 565 520 565 330
    C565 230 545 140 510 80
    H670
    C705 80 725 100 725 135
    V170
    C725 205 705 225 670 225
    H615
    C640 300 660 370 660 440

    C660 620 610 745 400 760
    C190 745 140 620 140 440

    C140 370 160 300 185 225
    H130
    C95 225 75 205 75 170
    V135
    C75 100 95 80 130 80
    Z
  "/>
</svg>

`;

const HOUSE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 614 654" width="614" height="654">
  <path fill="#000" fill-rule="evenodd" d="
    M 310 71
    L 48 345
    L 47 357
    L 56 366
    L 102 366
    L 106 369
    L 106 610
    L 515 611
    L 517 369
    L 521 366
    L 567 366
    L 576 357
    L 575 345
    L 495 261
    L 495 146
    L 492 140
    L 480 132
    L 416 132
    L 404 141
    L 400 162
    L 317 75
    Z

    M 311 98
    L 392 182
    L 401 187
    L 411 186
    L 418 180
    L 423 150
    L 476 152
    L 476 268
    L 550 346
    L 512 349
    L 502 357
    L 498 365
    L 496 592
    L 125 590
    L 125 365
    L 121 357
    L 111 349
    L 73 346
    Z
  "/>
</svg>

`;

const TREE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 640" width="512" height="640">
  <!-- Canopy -->
  <path
    d="
      M256 40
      C190 40 140 80 130 120
      C80 125 50 165 60 210
      C30 240 30 300 70 330
      C90 380 150 400 190 395
      C205 410 225 415 256 415
      C287 415 307 410 322 395
      C362 400 422 380 442 330
      C482 300 482 240 452 210
      C462 165 432 125 382 120
      C372 80 322 40 256 40
      Z
    "
    fill="none"
    stroke="currentColor"
    stroke-width="20"
    stroke-linecap="round"
    stroke-linejoin="round"
  />

  <!-- Trunk -->
  <path
    d="
      M230 415
      C220 470 210 520 210 600
      C210 620 302 620 302 600
      C302 520 292 470 282 415
      Z
    "
    fill="none"
    stroke="currentColor"
    stroke-width="20"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>


`;

const UMBRELLA_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">

  <!-- Canopy -->
  <path
    d="
      M64 224
      C92 132 180 88 256 88
      C332 88 420 132 448 224

      C414 206 382 206 352 224
      C320 206 288 206 256 224
      C224 206 192 206 160 224
      C130 206 98 206 64 224
      Z
    "
    fill="none"
    stroke="currentColor"
    stroke-width="20"
    stroke-linecap="round"
    stroke-linejoin="round"
  />

  <!-- Shaft (closed, straight, always visible when filled) -->
  <path
    d="
      M246 224
      L266 224
      L266 384
      L246 384
      Z
    "
    fill="none"
    stroke="currentColor"
    stroke-width="20"
    stroke-linejoin="round"
  />

  <!-- Hook -->
  <path
    d="
      M266 384
      C266 424 222 438 196 418
      C172 400 180 360 214 350

      C204 366 206 386 222 394
      C238 402 266 392 266 384
      Z
    "
    fill="none"
    stroke="currentColor"
    stroke-width="20"
    stroke-linecap="round"
    stroke-linejoin="round"
  />

</svg>


`;

export const SVGs = {
  POINTER_SVG,
  WHEEL_SVG, // TODO wheel svg not working
  SPIRAL_SVG,
  HEART_SVG,
  FISH_SVG,
  STAR_SVG,
  CRESCENT_SVG,
  HORSESHOE_SVG,
  HOUSE_SVG,
  TREE_SVG,
  UMBRELLA_SVG,
};