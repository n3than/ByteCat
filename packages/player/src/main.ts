// Entry point of the full player (`playerBundle`): every runtime module, and the program from the
// page, as `toScript` (in @bytecat/compiler) writes it. Used where no bundler can build a player
// for one project, such as a page the web app downloads.
import { RUNTIME_MODULES } from "@bytecat/runtime/modules";
import { start } from "./start.js";

start(window.BYTECAT.program!(RUNTIME_MODULES));
