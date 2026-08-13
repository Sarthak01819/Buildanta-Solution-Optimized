/**
 * Free SplitText replacement — GSAP ka paid SplitText plugin nahi chahiye.
 *
 * Nested markup preserve karta hai: `<em>` ke andar wale characters ko
 * `.char--accent` milta hai. Seedha textContent lene se wo wrapper udd
 * jaata tha aur highlight gayab ho jaati thi.
 *
 * Screen readers ke liye original text aria-label mein jaata hai, warna
 * woh "W E   B U I L D" padhte hain.
 */
export function splitChars(el) {
  const label = el.textContent;
  const host = el.closest("[data-split-host]") || el;
  if (!host.getAttribute("aria-label")) host.setAttribute("aria-label", label);

  const chars = [];
  const frag = document.createDocumentFragment();

  /* Har character apne inline-block span mein hai, aur do inline-block ke beech
     line TOOT sakti hai. Isi wajah se contact ka heading "GOT SOMETHI / NG TO
     BUILD?" ban jaata tha — beech-o-beech shabd ke. `word-break` se fark nahi
     padta: browser shabd nahi tod raha, wo do boxes ke beech tod raha hai.

     Isliye ek word wrapper: uske andar nowrap, to shabd kabhi nahi tootega;
     shabdon ke BEECH break allowed rehta hai, jo chahiye bhi tha.

     `chars` array bilkul wahi rehta hai — same elements, same order — to har
     animation jaisi thi waisi hi chalti hai. */
  let word = null;
  const closeWord = () => { word = null; };
  const openWord = () => {
    if (word) return word;
    word = document.createElement("span");
    word.className = "word";
    frag.appendChild(word);
    return word;
  };

  const emit = (c, accent) => {
    const s = document.createElement("span");
    s.className = accent ? "char char--accent" : "char";
    s.setAttribute("aria-hidden", "true");
    if (c === " ") {
      s.innerHTML = "&nbsp;";
      s.style.width = "0.28em";
      // Space khud break point hai — wrapper ke bahar, warna sirf ek hi line.
      closeWord();
      frag.appendChild(s);
    } else {
      s.textContent = c;
      openWord().appendChild(s);
    }
    chars.push(s);
  };

  const walk = (node, accent) => {
    node.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) {
        for (const c of n.textContent) emit(c, accent);
      } else if (n.nodeType === Node.ELEMENT_NODE) {
        walk(n, accent || n.tagName === "EM" || n.hasAttribute("data-accent"));
      }
    });
  };

  walk(el, false);

  el.textContent = "";
  el.appendChild(frag);
  return chars;
}

export function splitAll(root = document) {
  const map = new Map();
  root.querySelectorAll("[data-split]").forEach((el) => {
    map.set(el, splitChars(el));
  });
  return map;
}
