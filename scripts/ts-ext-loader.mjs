import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./ts-ext-hooks.mjs", pathToFileURL("./scripts/"));
