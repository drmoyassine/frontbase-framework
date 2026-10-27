import React from 'react';
import {serializeCondition,type Condition} from '@frontbase/edge-core/conditions';
import {ConditionsEditor} from './ConditionsEditor';
export function VisibilityConditionEditor({value,onChange}:{value:string;onChange:(v:string)=>void}) {
    return <ConditionsEditor title="Visibility Condition" value={value||undefined} onChange={condition=>onChange(!condition?'':typeof condition==='string'?condition:serializeCondition(condition as Condition))}/>;
}
