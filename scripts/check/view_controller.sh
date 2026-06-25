#!/bin/bash
SERVER="ubuntu@57.182.89.146"
KEY="/home/arthur/.ssh/agentrix-tokyo.pem"

ssh -i $KEY -o StrictHostKeyChecking=no $SERVER 'cat /home/ubuntu/Agentrix/backend/src/modules/openclaw-bridge/openclaw-bridge.controller.ts'
