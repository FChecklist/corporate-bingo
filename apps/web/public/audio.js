/*
 * Number calling voice: the phone's own speech voice says the letter and the number, twice (no audio files are used).
 *   G 52 -> "Gee, fifty-two. Gee, five two."      B 7 -> "Bee, seven. Bee, seven."
 * The words are the same as spokenPhrase() in packages/shared/src/audio.ts (a test keeps the two identical).
 * Voice: US English (en-US) when the phone has one, otherwise any English voice.
 */
(function () {
  const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const LETTER_WORDS = ["Bee", "Eye", "En", "Gee", "Oh"], LETTERS = ["B", "I", "N", "G", "O"];
  const words = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : ""));
  const digits = (n) => String(n).split("").map((d) => ONES[+d]).join(" ");
  const col = (n) => Math.floor((n - 1) / 15);
  const letter = (n) => LETTERS[col(n)] || "";
  const label = (n) => (n >= 1 && n <= 75 ? letter(n) + " " + n : String(n)); // "B 7", "G 52"
  const phrase = (n) => { const l = LETTER_WORDS[col(n)]; return n < 10 ? `${l}, ${words(n)}. ${l}, ${words(n)}.` : `${l}, ${words(n)}. ${l}, ${digits(n)}.`; };

  const VERSION = "v1-en-us-speech";
  const A = (window.TBAudio = { phrase, label, letter, VERSION, enabled: true, unlocked: false, ctx: null, mode: "speech" });

  // Call from a tap (Join audio). Phones only allow sound after a tap.
  A.unlock = async () => {
    try {
      A.ctx = A.ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (A.ctx.state === "suspended") await A.ctx.resume();
      A.unlocked = true;
      if (window.speechSynthesis) { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); }
    } catch { A.unlocked = true; }
    return A.unlocked;
  };
  A.preload = async () => 0; // nothing to download: the voice is the phone's own

  const pickVoice = () => { const vs = speechSynthesis.getVoices(); return vs.find((v) => v.lang === "en-US" && /female|zira|samantha|natural|google/i.test(v.name)) || vs.find((v) => v.lang === "en-US") || vs.find((v) => /^en/.test(v.lang)); };
  A.play = (n) => {
    if (!A.enabled || !window.speechSynthesis) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(phrase(n));
      u.rate = 0.85; u.pitch = 1.0; u.lang = "en-US";
      const pick = pickVoice(); if (pick) u.voice = pick;
      speechSynthesis.speak(u);
    } catch {}
  };
  // A spoken message (the organizer's announcement, or the sound check). Uses the phone's own voice, so it costs nothing.
  A.say = (text, lead = "Message from the organizer. ") => {
    if (!A.enabled || !window.speechSynthesis) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(lead + text); u.rate = 0.9; u.lang = "en-US";
      const pick = pickVoice(); if (pick) u.voice = pick;
      speechSynthesis.speak(u);
    } catch {}
  };
  A.test = () => { A.unlock(); A.play(52); };
  A.stop = () => { try { window.speechSynthesis && speechSynthesis.cancel(); } catch {} };
})();
