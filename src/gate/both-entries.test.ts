// The whole plain suite again, with the sealed entry registered first: a page
// with no `sealed` attribute must behave the same on either entry.
import "./sealed-entry.js";
await import("./web-threshold.test.js");
