// A buzz under the finger. Android Chrome has navigator.vibrate. iPhones have nothing for the web, except that
// flipping an iOS switch (<input type="checkbox" switch>) ticks since iOS 18, in Safari and on the home screen,
// as long as it happens inside a tap. So the first tap makes a hidden switch and every tap flips it. That is also
// why only taps buzz: a timer firing on its own can't move the switch, and the iPhone stays quiet.

let sw: HTMLLabelElement | undefined;

function flip() {
  if (!sw) {
    sw = document.createElement("label");
    sw.ariaHidden = "true";
    sw.style.display = "none";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    sw.appendChild(input);
    document.head.appendChild(sw);
  }
  sw.click();
}

function buzz(pattern: number | number[]) {
  if (typeof window === "undefined") return;
  try {
    if (!navigator.vibrate?.(pattern)) flip();
  } catch {
    // no haptics here: nothing to do
  }
}

/** A light tick: a step, a toggle, a swipe landing. */
export const tap = () => buzz(10);
/** A firmer pulse: something committed (a bid placed, a move landed). */
export const confirm = () => buzz(30);
