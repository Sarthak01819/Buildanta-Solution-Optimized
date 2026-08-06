import "./styles/we-scale-standalone.css";
import { createConsultHand } from "./gl/ConsultHand.js";

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const smooth = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const stage = document.querySelector(".we-scale-stage");
const canvas = document.querySelector(".we-scale-canvas");
const experience = createConsultHand(canvas);

history.scrollRestoration = "manual";
let targetProgress = 0;
let renderedProgress = 0;
let frameId = 0;

const measureProgress = () => {
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  targetProgress = clamp01(scrollY / maxScroll);
};

const resize = () => {
  experience?.resize();
  measureProgress();
};

const render = (milliseconds) => {
  renderedProgress += (targetProgress - renderedProgress) * 0.085;
  if (Math.abs(targetProgress - renderedProgress) < 0.00008) {
    renderedProgress = targetProgress;
  }

  const copyIn = smooth((renderedProgress - 0.12) / 0.12);
  const copyOut = 1 - smooth((renderedProgress - 0.60) / 0.15);
  const copyOpacity = copyIn * copyOut;

  stage.style.setProperty("--scene-progress", renderedProgress.toFixed(4));
  stage.style.setProperty("--copy-opacity", copyOpacity.toFixed(4));
  stage.style.setProperty("--copy-lift", `${((1 - copyIn) * 4).toFixed(3)}vh`);

  experience?.setProgress(renderedProgress, 1);
  experience?.render(milliseconds / 1000);
  frameId = requestAnimationFrame(render);
};

addEventListener("scroll", measureProgress, { passive: true });
addEventListener("resize", resize, { passive: true });
addEventListener("pagehide", () => {
  cancelAnimationFrame(frameId);
  experience?.dispose();
}, { once: true });

scrollTo(0, 0);
resize();
frameId = requestAnimationFrame(render);
