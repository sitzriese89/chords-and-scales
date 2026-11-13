//! Information about the theory core itself.

use wasm_bindgen::prelude::*;

/// The version of the theory core.
#[wasm_bindgen]
pub fn version() -> String {
    theory::version().to_owned()
}
