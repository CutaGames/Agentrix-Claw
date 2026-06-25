import { Module, forwardRef, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentMemory } from '../../../entities/agent-memory.entity';
import { AgentWorkflow } from '../../../entities/agent-workflow.entity';
import { MemoryService } from './services/memory.service';
import { WorkflowEngine } from './services/workflow-engine.service';
import { SkillsRegistry } from './services/skills-registry.service';
import { PlannerService } from './services/planner.service';
import { AgentRuntime } from './agent-runtime.service';
import { ProductSearchSkill } from './skills/product-search.skill';
import { AddToCartSkill } from './skills/add-to-cart.skill';
import { ViewCartSkill } from './skills/view-cart.skill';
import { CheckoutSkill } from './skills/checkout.skill';
import { PaymentSkill } from './skills/payment.skill';
import { CancelOrderSkill } from './skills/cancel-order.skill';
import { UpdateCartItemSkill } from './skills/update-cart-item.skill';
import { RemoveFromCartSkill } from './skills/remove-from-cart.skill';
import { SearchModule } from '../../search/search.module';
import { ProductModule } from '../../product/product.module';
import { CartModule } from '../../cart/cart.module';
import { OrderModule } from '../../order/order.module';
import { PaymentModule } from '../../payment/payment.module';
import { AiCapabilityModule } from '../../ai-capability/ai-capability.module';
import { ecommerceWorkflow } from './workflows/ecommerce.workflow';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgentMemory, AgentWorkflow]),
    forwardRef(() => SearchModule),
    forwardRef(() => ProductModule),
    forwardRef(() => CartModule),
    forwardRef(() => OrderModule),
    forwardRef(() => PaymentModule),
    forwardRef(() => AiCapabilityModule),
  ],
  providers: [
    MemoryService,
    WorkflowEngine,
    SkillsRegistry,
    PlannerService,
    ProductSearchSkill,
    AddToCartSkill,
    ViewCartSkill,
    CheckoutSkill,
    PaymentSkill,
    CancelOrderSkill,
    UpdateCartItemSkill,
    RemoveFromCartSkill,
    AgentRuntime,
  ],
  exports: [
    MemoryService,
    WorkflowEngine,
    SkillsRegistry,
    PlannerService,
    AgentRuntime,
  ],
})
export class RuntimeModule implements OnModuleInit {
  constructor(
    private workflowEngine: WorkflowEngine,
    private skillsRegistry: SkillsRegistry,
    private productSearchSkill: ProductSearchSkill,
    private addToCartSkill: AddToCartSkill,
    private viewCartSkill: ViewCartSkill,
    private checkoutSkill: CheckoutSkill,
    private paymentSkill: PaymentSkill,
    private cancelOrderSkill: CancelOrderSkill,
    private updateCartItemSkill: UpdateCartItemSkill,
    private removeFromCartSkill: RemoveFromCartSkill,
  ) {}

  onModuleInit() {
    // 注册 Skills
    this.skillsRegistry.registerSkill(this.productSearchSkill);
    this.skillsRegistry.registerSkill(this.addToCartSkill);
    this.skillsRegistry.registerSkill(this.viewCartSkill);
    this.skillsRegistry.registerSkill(this.checkoutSkill);
    this.skillsRegistry.registerSkill(this.paymentSkill);
    this.skillsRegistry.registerSkill(this.cancelOrderSkill);
    this.skillsRegistry.registerSkill(this.updateCartItemSkill);
    this.skillsRegistry.registerSkill(this.removeFromCartSkill);

    // 注册 Workflows
    this.workflowEngine.registerWorkflow(ecommerceWorkflow);
  }
}
