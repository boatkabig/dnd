import { roll, rollD20, withSeed } from "../src/lib/engine/dice";

const rng = withSeed(42);
const r1 = roll("1d20+5", { rng });
console.log("roll('1d20+5'):", JSON.stringify(r1));

const r2 = rollD20(3, "none", { seed: 42 });
console.log("rollD20(3,'none',seed=42):", JSON.stringify(r2));

const r3 = roll("2d6+3");
console.log("roll('2d6+3'):", JSON.stringify(r3));
