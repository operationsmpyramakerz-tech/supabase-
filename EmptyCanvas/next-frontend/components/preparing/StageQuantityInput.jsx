"use client";

import {useState} from "react";
import {normalizeStageQuantityDraft} from "../../lib/preparing-stage-quantity-input.mjs";

/**
 * Stage quantity input: visually replaces an initial zero on focus, without
 * changing the saved draft until the user actually types a quantity.
 * Blurring an untouched field restores its original zero.
 */
export default function StageQuantityInput({value,onValueChange,onFocus,onBlur,...props}) {
  const [replaceInitialZero,setReplaceInitialZero]=useState(false);
  const isZero=String(value??"")==="0";
  return <input
    {...props}
    type="number"
    value={replaceInitialZero&&isZero?"":value??""}
    onFocus={event=>{setReplaceInitialZero(isZero);onFocus?.(event);}}
    onBlur={event=>{setReplaceInitialZero(false);onBlur?.(event);}}
    onChange={event=>{
      setReplaceInitialZero(false);
      onValueChange(normalizeStageQuantityDraft(event.currentTarget.value));
    }}
  />;
}
