import { useState } from "react";
import { engine } from "../engine.js";
import { Button } from "./ui.jsx";

/**
 * Try to cheat the robot. Two attacks up front (the ones that tell the story in one click each), the rest behind
 * "More". Shown while flying, and after a flight only while 0G is still cut so it can be restored.
 * Editing the log lives in step 3 (Prove it); asking the crew and the e-stop live in step 2.
 */
export default function StressBar() {
  const S = engine.S;
  const [more, setMore] = useState(false);
  const demo = S.status?.demo ?? {};
  const flying = engine.flying();
  if (S.comparing || (!flying && !demo.linkDown)) return null;
  return (
    <div className="panel enter enter-up pointer-events-auto flex h-14 items-center gap-2 rounded-2xl py-2 pr-2 pl-4">
      <span className="mr-1 font-display text-[12px] font-bold tracking-[0.08em] text-white/50 uppercase">Try to break it</span>
      {flying ? (
        <Button variant="destructive" size="md" onClick={engine.forge} title="The operator signs a fake 'continue' with its own key. The robot refuses it.">
          {demo.forgeArmed ? "Forge armed…" : "Forge a decision"}
        </Button>
      ) : null}
      <Button variant={demo.linkDown ? "danger" : "destructive"} size="md" onClick={engine.toggleLink} title="No signed answer means the lease runs out and the drone flies home. Nothing is faked.">
        {demo.linkDown ? "Restore 0G" : "Cut 0G"}
      </Button>
      {flying ? (
        more ? (
          <Button variant="destructive" size="md" onClick={engine.tamperAnswer} title="The core flips 0G's answer but keeps 0G's real signature. The robot refuses it.">
            {demo.tamperArmed ? "Flip armed…" : "Flip 0G's answer"}
          </Button>
        ) : (
          <Button variant="plain" size="md" onClick={() => setMore(true)} title="One more attack: flip 0G's answer but keep its signature">
            More…
          </Button>
        )
      ) : null}
    </div>
  );
}
