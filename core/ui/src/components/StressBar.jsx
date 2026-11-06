import { engine } from "../engine.js";
import { Button } from "./ui.jsx";

/** Optional: try to cheat the robot. Each one is refused, safe-stopped or caught by the verifier. */
export default function StressBar() {
  const S = engine.S;
  const demo = S.status?.demo ?? {};
  const flying = engine.flying();
  const has = !!engine.mission();
  if (S.comparing || (!flying && !has)) return null;
  return (
    <div className="panel enter enter-up pointer-events-auto flex h-12 items-center gap-1.5 rounded-2xl py-1.5 pr-1.5 pl-4">
      <span className="mr-1.5 text-[12px] font-medium text-white/45">Try to break it</span>
      <Button variant="destructive" disabled={!flying} onClick={engine.forge} title={flying ? "The operator signs a fake 'continue' with its own key. The robot refuses it." : "Available while the drone is flying"}>
        {demo.forgeArmed ? "Forge armed…" : "Forge a decision"}
      </Button>
      <Button variant="destructive" disabled={!flying} onClick={engine.tamperAnswer} title={flying ? "The core flips 0G's answer but keeps 0G's real signature. The robot refuses it." : "Available while the drone is flying"}>
        {demo.tamperArmed ? "Flip armed…" : "Flip 0G's answer"}
      </Button>
      <Button variant="destructive" disabled={!has} onClick={engine.tamperLog} title={has ? "Lower a severity in a local copy of the log. The verifier names the entry." : "Fly a survey first, then try editing its log"}>
        Edit the log
      </Button>
      <span className="mx-0.5 h-5 w-px bg-white/10" />
      <Button variant={demo.linkDown ? "danger" : "destructive"} onClick={engine.toggleLink} title="No signed answer means the lease runs out and the drone flies home. Nothing is faked.">
        {demo.linkDown ? "Restore 0G" : "Cut 0G"}
      </Button>
      <Button variant="destructive" disabled={!flying} onClick={engine.estop} title={flying ? "Stop the drone now and bring it home" : "Available while the drone is flying"}>
        E-stop
      </Button>
    </div>
  );
}
