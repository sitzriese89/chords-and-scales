//! WebAssembly bindings for the `theory` crate.
//!
//! A thin layer: one module per core area, no theory logic here (ADR-2). The app builds it
//! with `wasm-pack` (`pnpm --dir app wasm`, ADR-14).

mod meta;

pub use meta::version;
