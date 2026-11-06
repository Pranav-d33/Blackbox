/** Browser entry for web/verify.html: `npm run build:web` bundles this to web/verifier.bundle.js. */
import { loadFromChain, verifyMission } from "./core";
import { NETWORK_DEFAULTS } from "./networks";
import { arkivPublic, mirroredBlob } from "../arkiv/read";

/** The Arkiv mirror of 0G Storage, read straight from Rabdi in the browser. */
const arkivFallback = (accessKey = "") => {
  const c = arkivPublic(accessKey);
  return (root: string) => mirroredBlob(c, root);
};

(globalThis as any).BlackboxVerifier = { loadFromChain, verifyMission, NETWORK_DEFAULTS, arkivFallback };
