---
description: Pre-build UI & API Test Verification Workflow
---

# Pre-build Verification Workflow

This workflow ensures that all UI and API integrations are functional before triggering a production build for the mobile app.

## 1. UI Verification
- [ ] Check if the screens render without crashing.
- [ ] Verify that all new UI components match the design system (colors, spacing, typography).
- [ ] Ensure that interactive elements (buttons, tabs, inputs) respond correctly to user actions.
- [ ] Check for responsive design issues across different screen sizes if applicable.

## 2. API Integration Verification
- [ ] Verify that API endpoints in `mobile-app/src/services/` correctly match the backend routes.
- [ ] Check if the request payloads and response structures align with the TypeScript interfaces.
- [ ] Test data fetching states: loading, success (with data), and error handling.
- [ ] Ensure fallback mechanisms (e.g., seed data or mocks) are in place and function when the API is unreachable.

## 3. Specific Module Checks
- **Marketplace**:
  - [ ] OpenClaw Skills fetching and rendering.
  - [ ] Resources & Goods fetching.
  - [ ] Task Market fetching, filtering, and sorting.
  - [ ] Checkout flow and payment method selection.
  - [ ] Share poster generation and referral link tracking.
- **Commission Dashboard**:
  - [ ] Dashboard fetching earnings data correctly.
  - [ ] Referral tracking logic functioning properly.
- **Agent**:
  - [ ] WebSocket/SSE connection for chat stream rendering.
  - [ ] Local execution basics configured.
- **Social**:
  - [ ] Community feed rendering.
  - [ ] Chat integration (human-to-human, human-to-agent).

## 4. Final Review
- [ ] Run linting and type checks (`npm run lint`, `tsc --noEmit`).
- [ ] Verify that all environment variables are correctly set for the target environment.
- [ ] Build the app locally to ensure the build process does not fail (`npx expo export` or similar).

**Note:** Always complete these steps before submitting a new build to avoid runtime failures in the production environment.
