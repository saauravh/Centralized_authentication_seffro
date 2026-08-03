/**
 * Headless identity service.
 *
 * No view engine and no session middleware: this process serves JSON to our own
 * Laravel backends and nothing else. Users never reach it with a browser.
 */
export declare function createApp(): Promise<import("express-serve-static-core").Express>;
//# sourceMappingURL=app.d.ts.map