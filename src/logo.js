/* logo.js — Random Number Forest console logo */

(() => {
  if (window.__randomForestLogoShown) return;
  window.__randomForestLogoShown = true;

  const blue = "color:rgb(0,0,255);background-color:black;font-family:monospace;white-space:pre;";
  const red  = "color:rgb(255,0,0);background-color:black;font-family:monospace;white-space:pre;";

  const lines = [
    [["         ███             ███             ", blue]],
    [["       ███░            ███░            ██", blue]],
    [["     ███░            ███░            ███░", blue]],
    [["   ███░            ███░            ███░  ", blue]],
    [[" ███░            ███░            ███░    ", blue]],
    [["██░            ███░            ███░      ", blue]],
    [["░            ███░            ███░        ", blue]],
    [["            ░░░             ░░░          ", blue]],

    [
      ["     ███", blue],
      ["__", red],
      ["         ", blue],
      [".__", red],
      ["██             ███ ", blue],
    ],

    [
      ["   ███", blue],
      ["_/  |____  __|  |__   ____   ", red],
      ["███░  ", blue],
    ],

    [
      [" ███░ ", blue],
      ["\\   __\\  \\/  /  |  \\_/ ___\\", red],
      ["███░    ", blue],
    ],

    [
      ["██░    ", blue],
      ["|  |  >    <|   Y  \\  \\___", red],
      ["█░      ", blue],
    ],

    [
      ["░      ", blue],
      ["|__| /__/\\_ \\___|  /\\___  >", red],
      ["       ", blue],
    ],

    [
      ["           ███░   ", blue],
      ["\\/    \\/ ███░\\/", red],
      ["        ", blue],
    ],

    [["         ███░            ███░            ", blue]],
    [["        ░░░             ░░░             ░", blue]],
    [[" ███             ███             ███     ", blue]],
    [["██░            ███░            ███░      ", blue]],
    [["░            ███░            ███░        ", blue]],
    [["           ███░            ███░          ", blue]],
    [["         ███░            ███░            ", blue]],
    [["       ███░            ███░            ██", blue]],
  ];

  const parts = [];
  const args = [];

  for (const line of lines) {
    for (const [text, style] of line) {
      parts.push("%c" + text);
      args.push(style);
    }

    parts.push("\n");
  }

  console.log(parts.join(""), ...args);

  console.log(
    "%cRandom Number Forest",
    "color:#f0abfc;background:#000;font-family:monospace;font-weight:bold;"
  );
})();