/**
 * Recommendation Orchestrator — Enforces typed recommendation pipeline
 *
 * Purpose: Orchestrate the full recommendation pipeline ensuring deterministic order:
 * 1. Scenario Construction → Extract scenarios from tool results
 * 2. Candidate Generation → Generate recommendation options from scenarios
 * 3. Validation → Independently validate each candidate
 * 4. Selection → Select best candidate if validation passes
 *
 * Critical: Validation MUST pass before recommendation is delivered.
 * FAIL status blocks delivery entirely.
 */

import { EntityId } from "@house-fin/contracts";
import type { FinalRecommendation } from "@house-fin/domain";
import { buildToolBackedRecommendationWorkflow, isRecommendationWorkflow } from "./recommendation-workflow";
import { ToolExecutionResult } from "./ai-tool-executor";
import { RecommendationResearchOutcome, ResearchRequirement } from "./recommendation-research";
import { AdvisorWorkflow } from "@house-fin/contracts";

/**
 * Result of orchestrating a recommendation
 */
export interface OrchestrationResult {
    /** The final recommendation, if validation passed */
    recommendation: FinalRecommendation | null;
    /** Validation status from independent validator */
    validationStatus: "PASS" | "PASS_WITH_WARNINGS" | "FAIL" | "INSUFFICIENT_INFORMATION";
    /** Fallback message if recommendation was not generated */
    fallbackMessage?: string;
}

/**
 * Orchestrate the full recommendation pipeline
 *
 * This function enforces the strict order:
 * 1. Build scenarios from tools
 * 2. Generate candidates from scenarios
 * 3. Validate candidates independently
 * 4. Select best candidate (only if validation passed)
 *
 * @param toolResults - Results from tool execution
 * @param research - Research requirement and evidence
 * @param workflowType - Type of workflow being orchestrated
 * @param userMessage - Original user message for intent classification
 * @param householdId - Household identifier
 * @param memberId - Member making request
 * @param conversationId - Optional conversation context
 * @param policyVersion - Version of household policy
 * @param researchRequirement - Whether research was required
 * @returns Orchestration result with validation status
 */
export async function orchestrateRecommendation(
    toolResults: ToolExecutionResult[],
    research: RecommendationResearchOutcome,
    workflowType: AdvisorWorkflow,
    userMessage: string,
    householdId: EntityId,
    memberId: EntityId,
    conversationId: EntityId | undefined,
    policyVersion: number,
    researchRequirement: ResearchRequirement
): Promise<OrchestrationResult> {
    // Step 1: Verify this is a recommendation workflow
    if (!isRecommendationWorkflow(workflowType, researchRequirement)) {
        return {
            recommendation: null,
            validationStatus: "INSUFFICIENT_INFORMATION",
            fallbackMessage: "This workflow type does not require a recommendation.",
        };
    }

    // Step 2: Build workflow (scenarios → candidates → validation → selection)
    const workflow = buildToolBackedRecommendationWorkflow({
        toolResults,
        researchRequirement,
        research,
        workflowType,
        userMessage,
        householdId,
        memberId,
        conversationId,
        policyVersion,
    });

    // Step 3: Verify scenarios were constructed
    if (!workflow.scenarioConstruction.scenarios || workflow.scenarioConstruction.scenarios.length === 0) {
        return {
            recommendation: null,
            validationStatus: "INSUFFICIENT_INFORMATION",
            fallbackMessage: "Could not construct scenarios from available financial data.",
        };
    }

    // Step 4: Verify candidates were generated
    if (!workflow.candidates || workflow.candidates.length === 0) {
        return {
            recommendation: null,
            validationStatus: "INSUFFICIENT_INFORMATION",
            fallbackMessage: "No viable recommendation candidates could be generated from scenarios.",
        };
    }

    // Step 5: Check validation results
    // CRITICAL: Only PASS and PASS_WITH_WARNINGS allow delivery
    const passedValidations = workflow.validations.filter(
        (v) => v.status === "PASS" || v.status === "PASS_WITH_WARNINGS"
    );

    if (passedValidations.length === 0) {
        return {
            recommendation: null,
            validationStatus: workflow.validation.status,
            fallbackMessage:
                workflow.validation.summary ||
                "All recommendation candidates failed independent validation checks.",
        };
    }

    // Step 6: Verify final recommendation was selected
    const finalRec = workflow.finalRecommendation;
    if (!finalRec) {
        return {
            recommendation: null,
            validationStatus: workflow.validation.status,
            fallbackMessage: "Could not select a final recommendation from validated candidates.",
        };
    }

    // Step 7: Return successful orchestration
    return {
        recommendation: finalRec,
        validationStatus: workflow.validation.status,
    };
}
