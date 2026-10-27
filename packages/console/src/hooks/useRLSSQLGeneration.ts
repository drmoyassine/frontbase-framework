
import { useCallback, useMemo } from 'react';
import type {
    RLSOperation,
    RLSCondition,
    RLSConditionGroup
} from '@/types/rls';

interface UseRLSSQLGenerationProps {
    actorConditionGroup: RLSConditionGroup;
    conditionGroup: RLSConditionGroup;
    isUnauthenticated: boolean;
    config: any; // UserContactConfig
    operation: RLSOperation;
}

export function useRLSSQLGeneration({
    actorConditionGroup,
    conditionGroup,
    isUnauthenticated,
    config,
    operation
}: UseRLSSQLGenerationProps) {

    // Build SQL expression from conditions
    const buildSQLExpression = useCallback((): { using: string; check: string } => {
        const parts: string[] = [];

        // 1. Build Actor Conditions (Who is the user?)
        // Generates: EXISTS (SELECT 1 FROM contacts WHERE auth_user_id = auth.uid() AND ...conditions...)
        const actorConditions: string[] = [];

        // Skip actor checks if Unauthenticated
        if (!isUnauthenticated) {
            // Add implicit auth check
            if (config?.columnMapping?.authUserIdColumn) {
                actorConditions.push(`${config.columnMapping.authUserIdColumn} = auth.uid()`);
            }

            // Add visual builder conditions for contacts
            actorConditionGroup.conditions.forEach((cond) => {
                if (!('column' in cond) || !cond.column) return;
                const condition = cond as RLSCondition;
                let sql = `${condition.column} `;

                const val = condition.source === 'literal' && condition.literalValue
                    ? `'${condition.literalValue.replace(/'/g, "''")}'`
                    : 'NULL';

                switch (condition.operator) {
                    case 'equals': sql += `= ${val}`; break;
                    case 'not_equals': sql += `!= ${val}`; break;
                    case 'greater_than': sql += `> ${val}`; break;
                    case 'less_than': sql += `< ${val}`; break;
                    case 'in': sql += `IN (${val})`; break;
                    case 'is_null': sql += `IS NULL`; break;
                    case 'is_not_null': sql += `IS NOT NULL`; break;
                    case 'contains': sql += `ILIKE '%' || ${val} || '%'`; break;
                    case 'starts_with': sql += `ILIKE ${val} || '%'`; break;
                    default: sql += `= ${val}`;
                }
                actorConditions.push(sql);
            });
        }

        // 2. Build Row Conditions (Which rows?)
        const rowConditions: string[] = [];
        conditionGroup.conditions.forEach((cond) => {
            if (!('column' in cond) || !cond.column) return;

            const condition = cond as RLSCondition;
            const leftSide = condition.column;
            let rightSide = '';

            if (condition.source === 'auth') {
                rightSide = 'auth.uid()';
            } else if (condition.source === 'contacts' && condition.sourceColumn && config && !isUnauthenticated) {
                rightSide = `(SELECT ${condition.sourceColumn} FROM ${config.contactsTable} WHERE ${config.columnMapping.authUserIdColumn} = auth.uid())`;
            } else if (condition.source === 'user_attribute' && condition.sourceColumn && config && !isUnauthenticated) {
                rightSide = `(SELECT ${condition.sourceColumn} FROM ${config.contactsTable} WHERE ${config.columnMapping.authUserIdColumn} = auth.uid())`;
            } else if (condition.source === 'literal' && condition.literalValue) {
                rightSide = `'${condition.literalValue.replace(/'/g, "''")}'`;
            }

            // Skip invalid condition for unauth
            if (!rightSide && (condition.source === 'contacts' || condition.source === 'user_attribute') && isUnauthenticated) {
                return;
            }

            let sqlCondition = '';
            switch (condition.operator) {
                case 'equals': sqlCondition = `${leftSide} = ${rightSide}`; break;
                case 'not_equals': sqlCondition = `${leftSide} != ${rightSide}`; break;
                case 'greater_than': sqlCondition = `${leftSide} > ${rightSide}`; break;
                case 'less_than': sqlCondition = `${leftSide} < ${rightSide}`; break;
                case 'in': sqlCondition = `${leftSide} IN ${rightSide}`; break;
                case 'not_in': sqlCondition = `${leftSide} NOT IN ${rightSide}`; break;
                case 'is_null': sqlCondition = `${leftSide} IS NULL`; break;
                case 'is_not_null': sqlCondition = `${leftSide} IS NOT NULL`; break;
                case 'contains': sqlCondition = `${leftSide} ILIKE '%' || ${rightSide} || '%'`; break;
                case 'starts_with': sqlCondition = `${leftSide} ILIKE ${rightSide} || '%'`; break;
            }
            if (sqlCondition) rowConditions.push(sqlCondition);
        });

        // Combined Actor Clause
        const actorClause = !isUnauthenticated && actorConditions.length > 0
            ? `EXISTS (SELECT 1 FROM ${config?.contactsTable} WHERE ${actorConditions.join(` ${actorConditionGroup.combinator} `)})`
            : 'true';

        // Combined Row Clause
        const rowClause = rowConditions.length > 0
            ? `(${rowConditions.join(` ${conditionGroup.combinator} `)})`
            : 'true';

        // Final Assembly
        let finalUsing = '';
        if (!isUnauthenticated && actorConditionGroup.conditions.some(c => 'column' in c && c.column)) {
            finalUsing = `(${actorClause}) AND ${rowClause}`;
        } else {
            // Unauthenticated or no actor conditions
            finalUsing = rowClause;
        }

        // For INSERT/UPDATE/ALL, check is same as using
        const finalCheck = ['INSERT', 'UPDATE', 'ALL'].includes(operation) ? finalUsing : '';

        return { using: finalUsing, check: finalCheck };

    }, [actorConditionGroup, conditionGroup, config, operation, isUnauthenticated]);

    return { buildSQLExpression };
}
