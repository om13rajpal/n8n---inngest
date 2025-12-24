# n8n to Inngest Converter - Technical Design Specification

## 1. Core Type System

### 1.1 Foundation Types

```typescript
// src/types/common.ts

/**
 * Severity levels for conversion warnings and errors
 */
export type Severity = 'info' | 'warning' | 'error';

/**
 * Conversion result status
 */
export type ConversionStatus = 'success' | 'partial' | 'failed';

/**
 * Output format options
 */
export type OutputFormat = 'single-file' | 'multi-file' | 'monorepo';

/**
 * Result of a conversion operation
 */
export interface ConversionResult {
  status: ConversionStatus;
  files: GeneratedFile[];
  warnings: ConversionWarning[];
  metadata: ConversionMetadata;
  stats: ConversionStats;
}

export interface GeneratedFile {
  path: string;
  content: string;
  type: 'typescript' | 'json' | 'markdown' | 'env';
  description: string;
}

export interface ConversionMetadata {
  sourceWorkflowName: string;
  sourceWorkflowId?: string;
  convertedAt: string;
  converterVersion: string;
  inngestVersion: string;
  nodeCount: number;
  unsupportedNodes: string[];
}

export interface ConversionStats {
  totalNodes: number;
  convertedNodes: number;
  skippedNodes: number;
  generatedSteps: number;
  conversionTimeMs: number;
  codeLines: number;
}
```

### 1.2 Parser Types

```typescript
// src/types/n8n.ts

/**
 * Complete n8n workflow structure
 */
export interface N8nWorkflow {
  id?: string;
  name: string;
  nodes: N8nNode[];
  connections: N8nConnections;
  active: boolean;
  settings?: WorkflowSettings;
  staticData?: Record<string, unknown>;
  tags?: WorkflowTag[];
  pinData?: Record<string, unknown[]>;
  versionId?: string;
  meta?: WorkflowMeta;
}

/**
 * Individual node in n8n workflow
 */
export interface N8nNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: NodeParameters;
  credentials?: Record<string, CredentialReference>;
  disabled?: boolean;
  notes?: string;
  notesInFlow?: boolean;

  // Error handling configuration
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;

  // Execution behavior
  alwaysOutputData?: boolean;
  executeOnce?: boolean;
  continueOnFail?: boolean;
  onError?: ErrorMode;

  // Webhook specific
  webhookId?: string;

  // Color coding (UI only, but useful for grouping)
  color?: string;
}

export type ErrorMode =
  | 'continueErrorOutput'
  | 'continueRegularOutput'
  | 'stopWorkflow';

export type NodeParameters = Record<string, unknown>;

/**
 * Connection structure mapping node outputs to inputs
 */
export interface N8nConnections {
  [sourceNodeName: string]: {
    [outputType: string]: ConnectionPath[][];
  };
}

export interface ConnectionPath {
  node: string;
  type: string;
  index: number;
}

export interface CredentialReference {
  id: string;
  name: string;
}

export interface WorkflowSettings {
  executionOrder?: 'v0' | 'v1';
  saveDataErrorExecution?: 'all' | 'none';
  saveDataSuccessExecution?: 'all' | 'none';
  saveManualExecutions?: boolean;
  callerPolicy?: 'any' | 'workflowsFromSameOwner' | 'workflowsFromAList';
  timezone?: string;
  errorWorkflow?: string;
}

export interface WorkflowTag {
  id: string;
  name: string;
}

export interface WorkflowMeta {
  templateCredsSetupCompleted?: boolean;
  instanceId?: string;
}
```

### 1.3 Graph Types

```typescript
// src/types/graph.ts

/**
 * Workflow represented as directed acyclic graph
 */
export interface WorkflowGraph {
  nodes: Map<string, GraphNode>;
  edges: Edge[];
  entryPoints: GraphNode[];
  executionOrder: GraphNode[];
  branches: BranchPoint[];
  loops: LoopStructure[];
  metadata: GraphMetadata;
}

export interface GraphNode {
  id: string;
  name: string;
  n8nNode: N8nNode;

  // Graph properties
  inDegree: number;
  outDegree: number;
  predecessors: GraphNode[];
  successors: GraphNode[];

  // Execution properties
  executionIndex: number;
  depth: number;
  isEntryPoint: boolean;
  isConditional: boolean;
  isLoop: boolean;

  // For optimization
  canRunInParallel: boolean;
  parallelGroup?: number;
}

export interface Edge {
  id: string;
  from: GraphNode;
  to: GraphNode;
  outputIndex: number;
  inputIndex: number;
  outputType: string;
  branchName?: string;
  condition?: string;
}

export interface BranchPoint {
  node: GraphNode;
  type: 'if' | 'switch' | 'merge';
  branches: Branch[];
  defaultBranch?: Branch;
}

export interface Branch {
  condition: string;
  conditionExpression?: string;
  path: GraphNode[];
  outputIndex: number;
}

export interface LoopStructure {
  loopNode: GraphNode;
  itemsSource: GraphNode | null;
  itemsExpression: string;
  iterationNodes: GraphNode[];
  batchSize: number;
}

export interface GraphMetadata {
  nodeCount: number;
  edgeCount: number;
  maxDepth: number;
  hasCycles: boolean;
  hasConditionals: boolean;
  hasLoops: boolean;
  parallelizableGroups: number;
}
```

### 1.4 Code Generation Types

```typescript
// src/types/codegen.ts

/**
 * Context passed through code generation pipeline
 */
export interface CodeGenContext {
  workflow: N8nWorkflow;
  graph: WorkflowGraph;
  options: ConversionOptions;

  // Accumulated during generation
  generatedFunctions: Map<string, GeneratedFunction>;
  imports: Set<string>;
  environmentVars: Map<string, EnvVarMetadata>;
  warnings: ConversionWarning[];

  // State for nested generation
  currentDepth: number;
  variableScope: Map<string, string>;
  stepCounter: number;
}

export interface ConversionOptions {
  outputFormat: OutputFormat;
  includeComments: boolean;
  includeOriginalJson: boolean;
  strictMode: boolean;
  targetInngestVersion: string;
  prettify: boolean;
  generateTests: boolean;
  customMapperDir?: string;
}

export interface GeneratedFunction {
  id: string;
  name: string;
  functionCode: string;
  dependencies: PackageDependency[];
  eventTrigger?: EventTriggerConfig;
  scheduleTrigger?: ScheduleTriggerConfig;
  configOptions: InngestFunctionConfig;
}

export interface PackageDependency {
  name: string;
  version: string;
  type: 'dependency' | 'devDependency';
}

export interface EventTriggerConfig {
  eventName: string;
  eventSchema?: string;
  condition?: string;
}

export interface ScheduleTriggerConfig {
  cron?: string;
  interval?: string;
  timezone?: string;
}

export interface InngestFunctionConfig {
  id: string;
  name: string;
  retries?: number;
  concurrency?: number | Array<{ limit: number; key?: string }>;
  rateLimit?: {
    limit: number;
    period: string;
    key?: string;
  };
  cancelOn?: Array<{
    event: string;
    if?: string;
  }>;
  debounce?: {
    period: string;
    key?: string;
  };
  throttle?: {
    limit: number;
    period: string;
    key?: string;
  };
}

export interface CodeFragment {
  stepName: string;
  stepCode: string;
  imports: string[];
  types?: string[];
  environmentVars: EnvVarMetadata[];
  comments: string[];
  warnings?: ConversionWarning[];
  variableBindings?: Map<string, string>;
}

export interface EnvVarMetadata {
  key: string;
  description: string;
  example: string;
  required: boolean;
  source: string;
  defaultValue?: string;
  validationRegex?: string;
}

export interface ConversionWarning {
  severity: Severity;
  nodeId: string;
  nodeName: string;
  message: string;
  suggestion?: string;
  documentationLink?: string;
}
```

---

## 2. Node Mapper System

### 2.1 Base Mapper Interface

```typescript
// src/mappers/base-mapper.ts

/**
 * Abstract base class for all node mappers
 * Provides common functionality and enforces interface
 */
export abstract class BaseNodeMapper implements NodeMapper {
  abstract readonly nodeType: string;
  abstract readonly supportedVersions?: string;
  abstract readonly description: string;

  /**
   * Check if this mapper can handle a specific node
   */
  canHandle(node: N8nNode): boolean {
    if (node.type !== this.nodeType) {
      return false;
    }

    if (this.supportedVersions) {
      return this.isVersionSupported(node.typeVersion);
    }

    return true;
  }

  /**
   * Generate Inngest step code for this node
   */
  abstract generateCode(
    node: N8nNode,
    context: CodeGenContext
  ): CodeFragment;

  /**
   * Extract npm dependencies needed for this node
   */
  getDependencies(node: N8nNode): PackageDependency[] {
    return [];
  }

  /**
   * Extract environment variables needed
   */
  getEnvironmentVars(node: N8nNode): EnvVarMetadata[] {
    return [];
  }

  /**
   * Validate node configuration
   */
  validate(node: N8nNode): ConversionWarning[] {
    return [];
  }

  /**
   * Protected helper methods
   */
  protected sanitizeStepName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  protected sanitizeVarName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/^[0-9]/, '_$&');
  }

  protected extractCredentials(
    node: N8nNode
  ): Map<string, CredentialReference> {
    return new Map(Object.entries(node.credentials || {}));
  }

  protected isVersionSupported(version: number): boolean {
    if (!this.supportedVersions) {
      return true;
    }

    // Simple version range checking
    // Format: ">=2.0.0", "1.x", "2.0.0-3.0.0"
    // TODO: Implement proper semver checking
    return true;
  }

  protected addWarning(
    warnings: ConversionWarning[],
    node: N8nNode,
    message: string,
    severity: Severity = 'warning',
    suggestion?: string
  ): void {
    warnings.push({
      severity,
      nodeId: node.id,
      nodeName: node.name,
      message,
      suggestion,
    });
  }
}
```

### 2.2 Mapper Registry

```typescript
// src/mappers/registry.ts

/**
 * Singleton registry for node mappers
 * Handles registration, discovery, and lookup
 */
export class NodeMapperRegistry {
  private static instance: NodeMapperRegistry;
  private mappers: Map<string, NodeMapper> = new Map();
  private fallbackMapper: NodeMapper;

  private constructor() {
    this.fallbackMapper = new GenericNodeMapper();
    this.registerBuiltInMappers();
  }

  static getInstance(): NodeMapperRegistry {
    if (!NodeMapperRegistry.instance) {
      NodeMapperRegistry.instance = new NodeMapperRegistry();
    }
    return NodeMapperRegistry.instance;
  }

  /**
   * Register a node mapper
   */
  register(mapper: NodeMapper): void {
    if (this.mappers.has(mapper.nodeType)) {
      console.warn(
        `Mapper for ${mapper.nodeType} already registered, overwriting`
      );
    }
    this.mappers.set(mapper.nodeType, mapper);
  }

  /**
   * Get mapper for a specific node
   */
  getMapper(node: N8nNode): NodeMapper {
    const mapper = this.mappers.get(node.type);

    if (!mapper) {
      console.warn(
        `No mapper found for node type: ${node.type}, using fallback`
      );
      return this.fallbackMapper;
    }

    if (!mapper.canHandle(node)) {
      console.warn(
        `Mapper found but cannot handle node version ${node.typeVersion}`
      );
      return this.fallbackMapper;
    }

    return mapper;
  }

  /**
   * List all registered mappers
   */
  listMappers(): NodeMapper[] {
    return Array.from(this.mappers.values());
  }

  /**
   * Get supported node types
   */
  getSupportedNodeTypes(): string[] {
    return Array.from(this.mappers.keys()).sort();
  }

  /**
   * Check if a node type is supported
   */
  isSupported(nodeType: string): boolean {
    return this.mappers.has(nodeType);
  }

  /**
   * Load custom mappers from directory
   */
  async loadCustomMappers(directory: string): Promise<number> {
    let loaded = 0;

    try {
      const files = await fs.readdir(directory);

      for (const file of files) {
        if (file.endsWith('.ts') || file.endsWith('.js')) {
          try {
            const modulePath = path.join(directory, file);
            const mapperModule = await import(modulePath);

            // Look for exported mappers
            for (const exportedItem of Object.values(mapperModule)) {
              if (this.isNodeMapper(exportedItem)) {
                this.register(exportedItem as NodeMapper);
                loaded++;
              }
            }
          } catch (error) {
            console.error(`Failed to load mapper from ${file}:`, error);
          }
        }
      }
    } catch (error) {
      console.error(`Failed to read mapper directory:`, error);
    }

    return loaded;
  }

  private registerBuiltInMappers(): void {
    // Register core mappers
    this.register(new HttpRequestMapper());
    this.register(new WebhookMapper());
    this.register(new CodeNodeMapper());
    this.register(new IfNodeMapper());
    this.register(new SwitchNodeMapper());
    this.register(new SetNodeMapper());
    this.register(new FunctionNodeMapper());
    this.register(new WaitNodeMapper());
    this.register(new ScheduleTriggerMapper());
    this.register(new EmailSendMapper());
    this.register(new SplitInBatchesMapper());
    this.register(new MergeMapper());
  }

  private isNodeMapper(obj: unknown): boolean {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'nodeType' in obj &&
      'generateCode' in obj &&
      typeof (obj as any).generateCode === 'function'
    );
  }
}

// Export singleton instance
export const registry = NodeMapperRegistry.getInstance();
```

---

## 3. Graph Analysis Algorithms

### 3.1 Graph Builder

```typescript
// src/graph/graph-builder.ts

/**
 * Builds directed acyclic graph from n8n connections
 */
export class GraphBuilder {
  private nodeMap: Map<string, GraphNode> = new Map();
  private edges: Edge[] = [];

  build(workflow: N8nWorkflow): WorkflowGraph {
    // Step 1: Create graph nodes
    this.createNodes(workflow.nodes);

    // Step 2: Create edges from connections
    this.createEdges(workflow.connections);

    // Step 3: Calculate graph properties
    this.calculateDegrees();
    this.findEntryPoints();
    this.calculateDepths();

    // Step 4: Detect special structures
    const branches = this.detectBranches();
    const loops = this.detectLoops();

    // Step 5: Determine execution order
    const executionOrder = this.topologicalSort();

    // Step 6: Analyze parallelization opportunities
    this.analyzeParallelization();

    return {
      nodes: this.nodeMap,
      edges: this.edges,
      entryPoints: this.findEntryPointNodes(),
      executionOrder,
      branches,
      loops,
      metadata: this.generateMetadata(),
    };
  }

  private createNodes(nodes: N8nNode[]): void {
    for (const n8nNode of nodes) {
      const graphNode: GraphNode = {
        id: n8nNode.id,
        name: n8nNode.name,
        n8nNode,
        inDegree: 0,
        outDegree: 0,
        predecessors: [],
        successors: [],
        executionIndex: -1,
        depth: 0,
        isEntryPoint: false,
        isConditional: this.isConditionalNode(n8nNode),
        isLoop: this.isLoopNode(n8nNode),
        canRunInParallel: false,
      };

      this.nodeMap.set(n8nNode.name, graphNode);
    }
  }

  private createEdges(connections: N8nConnections): void {
    let edgeId = 0;

    for (const [sourceName, outputs] of Object.entries(connections)) {
      const sourceNode = this.nodeMap.get(sourceName);
      if (!sourceNode) continue;

      for (const [outputType, branches] of Object.entries(outputs)) {
        for (let branchIdx = 0; branchIdx < branches.length; branchIdx++) {
          const branch = branches[branchIdx];

          for (const connection of branch) {
            const targetNode = this.nodeMap.get(connection.node);
            if (!targetNode) continue;

            const edge: Edge = {
              id: `edge-${edgeId++}`,
              from: sourceNode,
              to: targetNode,
              outputIndex: branchIdx,
              inputIndex: connection.index,
              outputType,
              branchName: this.getBranchName(sourceNode, branchIdx),
            };

            this.edges.push(edge);
            sourceNode.successors.push(targetNode);
            targetNode.predecessors.push(sourceNode);
          }
        }
      }
    }
  }

  private calculateDegrees(): void {
    for (const node of this.nodeMap.values()) {
      node.inDegree = node.predecessors.length;
      node.outDegree = node.successors.length;
    }
  }

  private findEntryPoints(): void {
    for (const node of this.nodeMap.values()) {
      node.isEntryPoint = node.inDegree === 0;
    }
  }

  private calculateDepths(): void {
    const queue: GraphNode[] = this.findEntryPointNodes();

    for (const node of queue) {
      node.depth = 0;
    }

    while (queue.length > 0) {
      const node = queue.shift()!;

      for (const successor of node.successors) {
        successor.depth = Math.max(successor.depth, node.depth + 1);

        if (!queue.includes(successor)) {
          queue.push(successor);
        }
      }
    }
  }

  /**
   * Kahn's algorithm for topological sorting
   */
  private topologicalSort(): GraphNode[] {
    const sorted: GraphNode[] = [];
    const queue: GraphNode[] = this.findEntryPointNodes();
    const inDegree = new Map<string, number>();

    // Initialize in-degree map
    for (const node of this.nodeMap.values()) {
      inDegree.set(node.id, node.inDegree);
    }

    while (queue.length > 0) {
      const node = queue.shift()!;
      node.executionIndex = sorted.length;
      sorted.push(node);

      // Process successors
      for (const successor of node.successors) {
        const degree = inDegree.get(successor.id)! - 1;
        inDegree.set(successor.id, degree);

        if (degree === 0) {
          queue.push(successor);
        }
      }
    }

    // Check for cycles
    if (sorted.length !== this.nodeMap.size) {
      throw new Error(
        'Workflow contains cycles - cannot convert to linear Inngest steps'
      );
    }

    return sorted;
  }

  private detectBranches(): BranchPoint[] {
    const branches: BranchPoint[] = [];

    for (const node of this.nodeMap.values()) {
      if (node.isConditional) {
        const branchPoint = this.analyzeBranchPoint(node);
        branches.push(branchPoint);
      }
    }

    return branches;
  }

  private analyzeBranchPoint(node: GraphNode): BranchPoint {
    const type = this.getBranchType(node.n8nNode);
    const branches: Branch[] = [];

    // Group successors by output index
    const outputGroups = new Map<number, GraphNode[]>();
    for (const edge of this.edges) {
      if (edge.from === node) {
        if (!outputGroups.has(edge.outputIndex)) {
          outputGroups.set(edge.outputIndex, []);
        }
        outputGroups.get(edge.outputIndex)!.push(edge.to);
      }
    }

    // Create branch for each output
    for (const [outputIndex, nodes] of outputGroups) {
      branches.push({
        condition: this.extractCondition(node.n8nNode, outputIndex),
        conditionExpression: this.extractConditionExpression(
          node.n8nNode,
          outputIndex
        ),
        path: this.tracePath(nodes[0], new Set()),
        outputIndex,
      });
    }

    return { node, type, branches };
  }

  private detectLoops(): LoopStructure[] {
    const loops: LoopStructure[] = [];

    for (const node of this.nodeMap.values()) {
      if (node.isLoop) {
        const loop = this.analyzeLoop(node);
        loops.push(loop);
      }
    }

    return loops;
  }

  private analyzeLoop(loopNode: GraphNode): LoopStructure {
    // Find items source (predecessor that provides the array)
    const itemsSource = loopNode.predecessors.length > 0
      ? loopNode.predecessors[0]
      : null;

    // Extract items expression from loop node parameters
    const itemsExpression = this.extractItemsExpression(loopNode.n8nNode);

    // Find nodes that execute within the loop
    const iterationNodes = this.findIterationNodes(loopNode);

    // Extract batch size if specified
    const batchSize = (loopNode.n8nNode.parameters.batchSize as number) || 1;

    return {
      loopNode,
      itemsSource,
      itemsExpression,
      iterationNodes,
      batchSize,
    };
  }

  private analyzeParallelization(): void {
    let groupId = 0;

    // Group nodes by depth and check for independence
    const depthGroups = new Map<number, GraphNode[]>();
    for (const node of this.nodeMap.values()) {
      if (!depthGroups.has(node.depth)) {
        depthGroups.set(node.depth, []);
      }
      depthGroups.get(node.depth)!.push(node);
    }

    // Mark nodes that can run in parallel
    for (const nodes of depthGroups.values()) {
      if (nodes.length > 1 && this.areIndependent(nodes)) {
        for (const node of nodes) {
          node.canRunInParallel = true;
          node.parallelGroup = groupId;
        }
        groupId++;
      }
    }
  }

  private areIndependent(nodes: GraphNode[]): boolean {
    // Check if nodes share any predecessors or successors
    const allPredecessors = new Set<GraphNode>();
    const allSuccessors = new Set<GraphNode>();

    for (const node of nodes) {
      for (const pred of node.predecessors) {
        if (nodes.includes(pred)) return false;
        allPredecessors.add(pred);
      }
      for (const succ of node.successors) {
        if (nodes.includes(succ)) return false;
        allSuccessors.add(succ);
      }
    }

    return true;
  }

  // Helper methods
  private isConditionalNode(node: N8nNode): boolean {
    return (
      node.type === 'n8n-nodes-base.if' ||
      node.type === 'n8n-nodes-base.switch' ||
      node.type === 'n8n-nodes-base.merge'
    );
  }

  private isLoopNode(node: N8nNode): boolean {
    return (
      node.type === 'n8n-nodes-base.splitInBatches' ||
      node.type === 'n8n-nodes-base.loop'
    );
  }

  private getBranchType(node: N8nNode): BranchPoint['type'] {
    if (node.type === 'n8n-nodes-base.if') return 'if';
    if (node.type === 'n8n-nodes-base.switch') return 'switch';
    if (node.type === 'n8n-nodes-base.merge') return 'merge';
    return 'if';
  }

  private getBranchName(node: GraphNode, branchIndex: number): string {
    if (node.n8nNode.type === 'n8n-nodes-base.if') {
      return branchIndex === 0 ? 'true' : 'false';
    }
    return `branch-${branchIndex}`;
  }

  private extractCondition(node: N8nNode, outputIndex: number): string {
    // Extract human-readable condition
    if (node.type === 'n8n-nodes-base.if') {
      const conditions = node.parameters.conditions as any;
      return outputIndex === 0 ? 'true' : 'false';
    }
    return `output-${outputIndex}`;
  }

  private extractConditionExpression(
    node: N8nNode,
    outputIndex: number
  ): string {
    // Extract executable condition expression
    // This would need to parse n8n's expression syntax
    return 'true'; // Placeholder
  }

  private extractItemsExpression(node: N8nNode): string {
    // Extract expression that provides items to loop over
    return 'items'; // Placeholder
  }

  private tracePath(
    startNode: GraphNode,
    visited: Set<GraphNode>
  ): GraphNode[] {
    const path: GraphNode[] = [];
    let current: GraphNode | null = startNode;

    while (current && !visited.has(current)) {
      visited.add(current);
      path.push(current);

      // Follow linear path until branch or merge
      if (current.successors.length === 1) {
        current = current.successors[0];
      } else {
        break;
      }
    }

    return path;
  }

  private findIterationNodes(loopNode: GraphNode): GraphNode[] {
    // Find all nodes that execute within the loop
    const iterationNodes: GraphNode[] = [];
    const visited = new Set<GraphNode>();
    const queue = [...loopNode.successors];

    while (queue.length > 0) {
      const node = queue.shift()!;
      if (visited.has(node)) continue;

      visited.add(node);

      // Stop at loop boundaries
      if (node.isLoop && node !== loopNode) continue;

      iterationNodes.push(node);
      queue.push(...node.successors);
    }

    return iterationNodes;
  }

  private findEntryPointNodes(): GraphNode[] {
    return Array.from(this.nodeMap.values()).filter(n => n.isEntryPoint);
  }

  private generateMetadata(): GraphMetadata {
    return {
      nodeCount: this.nodeMap.size,
      edgeCount: this.edges.length,
      maxDepth: Math.max(...Array.from(this.nodeMap.values()).map(n => n.depth)),
      hasCycles: false, // Would have thrown error if cycles exist
      hasConditionals: Array.from(this.nodeMap.values()).some(n => n.isConditional),
      hasLoops: Array.from(this.nodeMap.values()).some(n => n.isLoop),
      parallelizableGroups: new Set(
        Array.from(this.nodeMap.values())
          .filter(n => n.parallelGroup !== undefined)
          .map(n => n.parallelGroup!)
      ).size,
    };
  }
}
```

---

## 4. Template System

### 4.1 Template Engine

```typescript
// src/codegen/template-engine.ts

import Handlebars from 'handlebars';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Template engine wrapper for Handlebars
 */
export class TemplateEngine {
  private templates: Map<string, HandlebarsTemplateDelegate> = new Map();
  private partials: Map<string, string> = new Map();

  constructor(private templateDir: string) {
    this.registerHelpers();
  }

  /**
   * Load and compile template
   */
  async loadTemplate(name: string): Promise<HandlebarsTemplateDelegate> {
    if (this.templates.has(name)) {
      return this.templates.get(name)!;
    }

    const templatePath = path.join(this.templateDir, `${name}.hbs`);
    const templateSource = await fs.readFile(templatePath, 'utf-8');
    const compiled = Handlebars.compile(templateSource);

    this.templates.set(name, compiled);
    return compiled;
  }

  /**
   * Register partial template
   */
  async registerPartial(name: string, partialPath: string): Promise<void> {
    const source = await fs.readFile(partialPath, 'utf-8');
    Handlebars.registerPartial(name, source);
    this.partials.set(name, source);
  }

  /**
   * Render template with data
   */
  async render(templateName: string, data: unknown): Promise<string> {
    const template = await this.loadTemplate(templateName);
    return template(data);
  }

  /**
   * Register custom Handlebars helpers
   */
  private registerHelpers(): void {
    // Sanitize step name
    Handlebars.registerHelper('sanitizeStepName', (name: string) => {
      return name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    });

    // Sanitize variable name
    Handlebars.registerHelper('sanitizeVarName', (name: string) => {
      return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^[0-9]/, '_$&');
    });

    // JSON stringify
    Handlebars.registerHelper('json', (obj: unknown) => {
      return JSON.stringify(obj, null, 2);
    });

    // Conditional equality
    Handlebars.registerHelper('eq', (a: unknown, b: unknown) => {
      return a === b;
    });

    // Join array
    Handlebars.registerHelper('join', (arr: unknown[], separator: string) => {
      return arr.join(separator);
    });

    // Indent lines
    Handlebars.registerHelper('indent', (text: string, spaces: number) => {
      const indent = ' '.repeat(spaces);
      return text
        .split('\n')
        .map(line => indent + line)
        .join('\n');
    });

    // Escape for template literals
    Handlebars.registerHelper('escapeTemplateLiteral', (text: string) => {
      return text.replace(/`/g, '\\`').replace(/\${/g, '\\${');
    });
  }
}
```

---

## 5. Error Recovery and Fallback Strategies

```typescript
// src/mappers/fallback-mapper.ts

/**
 * Generic fallback mapper for unsupported nodes
 * Generates placeholder code with TODO comments
 */
export class GenericNodeMapper extends BaseNodeMapper {
  readonly nodeType = '*';
  readonly description = 'Fallback mapper for unsupported node types';

  generateCode(node: N8nNode, context: CodeGenContext): CodeFragment {
    const warnings: ConversionWarning[] = [];

    this.addWarning(
      warnings,
      node,
      `Node type '${node.type}' is not supported. Manual implementation required.`,
      'warning',
      'Implement this step manually or create a custom mapper'
    );

    const stepName = this.sanitizeStepName(node.name);
    const varName = this.sanitizeVarName(node.name);

    return {
      stepName,
      stepCode: `
        // TODO: Implement ${node.type} (${node.name})
        // Original parameters: ${JSON.stringify(node.parameters, null, 2)}
        const ${varName} = await step.run("${stepName}", async () => {
          throw new Error("Node type '${node.type}' not yet implemented");

          // TODO: Add your implementation here

          return {};
        });
      `,
      imports: [],
      environmentVars: [],
      comments: [
        `Unsupported node type: ${node.type}`,
        `Version: ${node.typeVersion}`,
        `Manual implementation required`,
      ],
      warnings,
    };
  }
}
```

---

**Document Status**: Draft for Implementation
**Next Steps**: Begin implementing Parser Module and Graph Builder
