/**
 * n8n Workflow Parser
 * Parses n8n workflow JSON and extracts structured data
 */

import {
  N8nWorkflow,
  N8nNode,
  N8nConnections,
  N8nConnectionArray,
  getNodeCategory,
  N8nNodeCategory,
  TRIGGER_NODE_TYPES,
} from '../types/n8n.js';

export interface ParsedWorkflow {
  name: string;
  id?: string;
  triggers: ParsedNode[];
  nodes: ParsedNode[];
  executionGraph: ExecutionGraph;
  credentials: CredentialReference[];
  settings: WorkflowSettings;
}

export interface ParsedNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  category: N8nNodeCategory;
  parameters: Record<string, unknown>;
  credentials: CredentialReference[];
  disabled: boolean;
  position: [number, number];
  incomingConnections: ConnectionInfo[];
  outgoingConnections: ConnectionInfo[];
}

export interface ConnectionInfo {
  nodeName: string;
  nodeId: string;
  outputIndex: number;
  inputIndex: number;
  connectionType: string;
}

export interface ExecutionGraph {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  entryPoints: string[];
  exitPoints: string[];
  branches: BranchInfo[];
  loops: LoopInfo[];
}

export interface GraphNode {
  id: string;
  name: string;
  type: string;
  depth: number;
  isConditional: boolean;
  isMergePoint: boolean;
  isLoopStart: boolean;
  isLoopEnd: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  outputIndex: number;
  inputIndex: number;
  condition?: string;
}

export interface BranchInfo {
  conditionNodeId: string;
  conditionNodeName: string;
  branches: Array<{
    index: number;
    condition: string;
    nodes: string[];
    mergePoint?: string;
  }>;
}

export interface LoopInfo {
  startNodeId: string;
  startNodeName: string;
  loopNodes: string[];
  endNodeId?: string;
}

export interface CredentialReference {
  nodeId: string;
  nodeName: string;
  credentialType: string;
  credentialId: string;
  credentialName: string;
}

export interface WorkflowSettings {
  errorWorkflow?: string;
  timezone?: string;
  saveDataErrorExecution?: string;
  saveDataSuccessExecution?: string;
  executionOrder?: string;
}

/**
 * Parse n8n workflow JSON into structured format
 */
export function parseWorkflow(workflow: N8nWorkflow): ParsedWorkflow {
  const nodeMap = new Map<string, N8nNode>();
  workflow.nodes.forEach(node => nodeMap.set(node.name, node));

  // Build connection maps for each node
  const incomingConnectionsMap = buildIncomingConnectionsMap(workflow.connections, nodeMap);
  const outgoingConnectionsMap = buildOutgoingConnectionsMap(workflow.connections, nodeMap);

  // Parse all nodes
  const parsedNodes: ParsedNode[] = workflow.nodes.map(node => parseNode(
    node,
    incomingConnectionsMap.get(node.name) || [],
    outgoingConnectionsMap.get(node.name) || []
  ));

  // Separate triggers from regular nodes
  const triggers = parsedNodes.filter(node => node.category === 'trigger');
  const regularNodes = parsedNodes.filter(node => node.category !== 'trigger');

  // Build execution graph
  const executionGraph = buildExecutionGraph(parsedNodes, workflow.connections);

  // Extract all credentials
  const credentials = extractCredentials(workflow.nodes);

  // Parse settings
  const settings: WorkflowSettings = {
    errorWorkflow: workflow.settings?.errorWorkflow,
    timezone: workflow.settings?.timezone,
    saveDataErrorExecution: workflow.settings?.saveDataErrorExecution,
    saveDataSuccessExecution: workflow.settings?.saveDataSuccessExecution,
    executionOrder: workflow.settings?.executionOrder,
  };

  return {
    name: workflow.name || 'converted-workflow',
    id: workflow.id,
    triggers,
    nodes: regularNodes,
    executionGraph,
    credentials,
    settings,
  };
}

/**
 * Parse a single n8n node
 */
function parseNode(
  node: N8nNode,
  incomingConnections: ConnectionInfo[],
  outgoingConnections: ConnectionInfo[]
): ParsedNode {
  const category = getNodeCategory(node.type);
  const credentials = node.credentials
    ? Object.entries(node.credentials).map(([type, cred]) => ({
        nodeId: node.id,
        nodeName: node.name,
        credentialType: type,
        credentialId: cred.id,
        credentialName: cred.name,
      }))
    : [];

  return {
    id: node.id,
    name: node.name,
    type: node.type,
    typeVersion: node.typeVersion,
    category,
    parameters: node.parameters,
    credentials,
    disabled: node.disabled || false,
    position: node.position,
    incomingConnections,
    outgoingConnections,
  };
}

/**
 * Build incoming connections map for all nodes
 */
function buildIncomingConnectionsMap(
  connections: N8nConnections,
  nodeMap: Map<string, N8nNode>
): Map<string, ConnectionInfo[]> {
  const incomingMap = new Map<string, ConnectionInfo[]>();

  for (const [sourceNodeName, connectionTypes] of Object.entries(connections)) {
    const sourceNode = nodeMap.get(sourceNodeName);
    if (!sourceNode) continue;

    for (const [connectionType, outputs] of Object.entries(connectionTypes)) {
      if (!outputs) continue;

      outputs.forEach((outputConnections, outputIndex) => {
        if (!outputConnections) return;

        outputConnections.forEach(conn => {
          const targetNodeName = conn.node;
          const existing = incomingMap.get(targetNodeName) || [];
          existing.push({
            nodeName: sourceNodeName,
            nodeId: sourceNode.id,
            outputIndex,
            inputIndex: conn.index,
            connectionType,
          });
          incomingMap.set(targetNodeName, existing);
        });
      });
    }
  }

  return incomingMap;
}

/**
 * Build outgoing connections map for all nodes
 */
function buildOutgoingConnectionsMap(
  connections: N8nConnections,
  nodeMap: Map<string, N8nNode>
): Map<string, ConnectionInfo[]> {
  const outgoingMap = new Map<string, ConnectionInfo[]>();

  for (const [sourceNodeName, connectionTypes] of Object.entries(connections)) {
    const sourceNode = nodeMap.get(sourceNodeName);
    if (!sourceNode) continue;

    const sourceConnections: ConnectionInfo[] = [];

    for (const [connectionType, outputs] of Object.entries(connectionTypes)) {
      if (!outputs) continue;

      outputs.forEach((outputConnections, outputIndex) => {
        if (!outputConnections) return;

        outputConnections.forEach(conn => {
          const targetNode = nodeMap.get(conn.node);
          if (!targetNode) return;

          sourceConnections.push({
            nodeName: conn.node,
            nodeId: targetNode.id,
            outputIndex,
            inputIndex: conn.index,
            connectionType,
          });
        });
      });
    }

    outgoingMap.set(sourceNodeName, sourceConnections);
  }

  return outgoingMap;
}

/**
 * Build execution graph for the workflow
 */
function buildExecutionGraph(
  parsedNodes: ParsedNode[],
  connections: N8nConnections
): ExecutionGraph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const entryPoints: string[] = [];
  const exitPoints: string[] = [];
  const branches: BranchInfo[] = [];
  const loops: LoopInfo[] = [];

  // Create graph nodes
  parsedNodes.forEach(node => {
    const isConditional = ['n8n-nodes-base.if', 'n8n-nodes-base.switch'].includes(node.type);
    const isMergePoint = node.type === 'n8n-nodes-base.merge';
    const isLoopStart = node.type === 'n8n-nodes-base.splitInBatches';

    nodes.set(node.name, {
      id: node.id,
      name: node.name,
      type: node.type,
      depth: 0,
      isConditional,
      isMergePoint,
      isLoopStart,
      isLoopEnd: false,
    });

    // Entry points are triggers or nodes with no incoming connections
    if (node.category === 'trigger' || node.incomingConnections.length === 0) {
      entryPoints.push(node.name);
    }

    // Exit points are nodes with no outgoing connections
    if (node.outgoingConnections.length === 0) {
      exitPoints.push(node.name);
    }
  });

  // Create edges
  for (const [sourceNodeName, connectionTypes] of Object.entries(connections)) {
    for (const [connectionType, outputs] of Object.entries(connectionTypes)) {
      if (!outputs) continue;

      outputs.forEach((outputConnections, outputIndex) => {
        if (!outputConnections) return;

        outputConnections.forEach(conn => {
          edges.push({
            from: sourceNodeName,
            to: conn.node,
            outputIndex,
            inputIndex: conn.index,
          });
        });
      });
    }
  }

  // Calculate node depths using BFS
  calculateNodeDepths(nodes, edges, entryPoints);

  // Detect branches (IF/Switch nodes)
  parsedNodes
    .filter(node => ['n8n-nodes-base.if', 'n8n-nodes-base.switch'].includes(node.type))
    .forEach(node => {
      const branchInfo = detectBranch(node, edges, nodes);
      if (branchInfo) {
        branches.push(branchInfo);
      }
    });

  // Detect loops (SplitInBatches nodes)
  parsedNodes
    .filter(node => node.type === 'n8n-nodes-base.splitInBatches')
    .forEach(node => {
      const loopInfo = detectLoop(node, edges, nodes);
      if (loopInfo) {
        loops.push(loopInfo);
        // Mark loop end node
        if (loopInfo.endNodeId) {
          const endNode = nodes.get(loopInfo.endNodeId);
          if (endNode) {
            endNode.isLoopEnd = true;
          }
        }
      }
    });

  return {
    nodes,
    edges,
    entryPoints,
    exitPoints,
    branches,
    loops,
  };
}

/**
 * Calculate depths of nodes using BFS from entry points
 */
function calculateNodeDepths(
  nodes: Map<string, GraphNode>,
  edges: GraphEdge[],
  entryPoints: string[]
): void {
  const visited = new Set<string>();
  const queue: Array<{ name: string; depth: number }> = [];

  entryPoints.forEach(name => {
    queue.push({ name, depth: 0 });
  });

  while (queue.length > 0) {
    const { name, depth } = queue.shift()!;
    if (visited.has(name)) continue;
    visited.add(name);

    const node = nodes.get(name);
    if (node) {
      node.depth = Math.max(node.depth, depth);
    }

    // Find all outgoing edges
    edges
      .filter(edge => edge.from === name)
      .forEach(edge => {
        if (!visited.has(edge.to)) {
          queue.push({ name: edge.to, depth: depth + 1 });
        }
      });
  }
}

/**
 * Detect branch structure from conditional node
 */
function detectBranch(
  conditionNode: ParsedNode,
  edges: GraphEdge[],
  nodes: Map<string, GraphNode>
): BranchInfo | null {
  const outgoingEdges = edges.filter(e => e.from === conditionNode.name);
  if (outgoingEdges.length === 0) return null;

  const branchGroups = new Map<number, GraphEdge[]>();
  outgoingEdges.forEach(edge => {
    const existing = branchGroups.get(edge.outputIndex) || [];
    existing.push(edge);
    branchGroups.set(edge.outputIndex, existing);
  });

  const branches: BranchInfo['branches'] = [];

  for (const [outputIndex, branchEdges] of branchGroups) {
    const branchNodes = collectBranchNodes(
      branchEdges.map(e => e.to),
      edges,
      conditionNode.name
    );

    let condition = outputIndex === 0 ? 'true branch' : 'false branch';
    if (conditionNode.type === 'n8n-nodes-base.switch') {
      condition = `output ${outputIndex}`;
    }

    branches.push({
      index: outputIndex,
      condition,
      nodes: branchNodes,
    });
  }

  // Find merge point (node that receives from multiple branches)
  const mergePoint = findMergePoint(branches, edges);

  return {
    conditionNodeId: conditionNode.id,
    conditionNodeName: conditionNode.name,
    branches: branches.map(b => ({
      ...b,
      mergePoint,
    })),
  };
}

/**
 * Collect all nodes in a branch
 */
function collectBranchNodes(
  startNodes: string[],
  edges: GraphEdge[],
  excludeNode: string
): string[] {
  const visited = new Set<string>();
  const queue = [...startNodes];
  const result: string[] = [];

  while (queue.length > 0) {
    const nodeName = queue.shift()!;
    if (visited.has(nodeName) || nodeName === excludeNode) continue;
    visited.add(nodeName);
    result.push(nodeName);

    // Add connected nodes (but stop at potential merge points)
    edges
      .filter(e => e.from === nodeName)
      .forEach(edge => {
        if (!visited.has(edge.to)) {
          queue.push(edge.to);
        }
      });
  }

  return result;
}

/**
 * Find merge point for branches
 */
function findMergePoint(
  branches: BranchInfo['branches'],
  edges: GraphEdge[]
): string | undefined {
  // Find nodes that are targets from multiple branches
  const targetCounts = new Map<string, number>();

  branches.forEach(branch => {
    const branchTargets = new Set<string>();
    branch.nodes.forEach(nodeName => {
      edges
        .filter(e => e.from === nodeName)
        .forEach(edge => {
          if (!branch.nodes.includes(edge.to)) {
            branchTargets.add(edge.to);
          }
        });
    });

    branchTargets.forEach(target => {
      targetCounts.set(target, (targetCounts.get(target) || 0) + 1);
    });
  });

  // Merge point is a node that receives connections from all branches
  for (const [nodeName, count] of targetCounts) {
    if (count >= branches.length) {
      return nodeName;
    }
  }

  return undefined;
}

/**
 * Detect loop structure from SplitInBatches node
 */
function detectLoop(
  loopNode: ParsedNode,
  edges: GraphEdge[],
  nodes: Map<string, GraphNode>
): LoopInfo | null {
  // SplitInBatches has two outputs: index 0 is "done", index 1 is "loop"
  const loopOutputEdges = edges.filter(e => e.from === loopNode.name && e.outputIndex === 1);
  if (loopOutputEdges.length === 0) return null;

  // Find all nodes in the loop
  const loopNodes: string[] = [];
  const visited = new Set<string>();
  const queue = loopOutputEdges.map(e => e.to);

  while (queue.length > 0) {
    const nodeName = queue.shift()!;
    if (visited.has(nodeName)) continue;
    visited.add(nodeName);

    // Check if this node connects back to the loop node
    const connectsBack = edges.some(e => e.from === nodeName && e.to === loopNode.name);

    if (connectsBack) {
      loopNodes.push(nodeName);
    } else if (nodeName !== loopNode.name) {
      loopNodes.push(nodeName);

      // Continue traversing
      edges
        .filter(e => e.from === nodeName)
        .forEach(edge => {
          if (!visited.has(edge.to)) {
            queue.push(edge.to);
          }
        });
    }
  }

  // Find the node that connects back to the loop (end of loop body)
  const endNodeName = loopNodes.find(nodeName =>
    edges.some(e => e.from === nodeName && e.to === loopNode.name)
  );

  return {
    startNodeId: loopNode.id,
    startNodeName: loopNode.name,
    loopNodes,
    endNodeId: endNodeName ? nodes.get(endNodeName)?.id : undefined,
  };
}

/**
 * Extract all credentials from workflow
 */
function extractCredentials(nodes: N8nNode[]): CredentialReference[] {
  const credentials: CredentialReference[] = [];

  nodes.forEach(node => {
    if (node.credentials) {
      Object.entries(node.credentials).forEach(([type, cred]) => {
        credentials.push({
          nodeId: node.id,
          nodeName: node.name,
          credentialType: type,
          credentialId: cred.id,
          credentialName: cred.name,
        });
      });
    }
  });

  return credentials;
}

/**
 * Get topologically sorted node execution order
 */
export function getExecutionOrder(graph: ExecutionGraph): string[] {
  const order: string[] = [];
  const visited = new Set<string>();
  const temp = new Set<string>();

  function visit(nodeName: string): void {
    if (visited.has(nodeName)) return;
    if (temp.has(nodeName)) {
      // Cycle detected (loop), skip
      return;
    }

    temp.add(nodeName);

    // Visit all nodes that come before this one
    graph.edges
      .filter(e => e.to === nodeName)
      .forEach(edge => visit(edge.from));

    temp.delete(nodeName);
    visited.add(nodeName);
    order.push(nodeName);
  }

  // Start from exit points and work backwards
  graph.exitPoints.forEach(visit);

  // Also include any remaining nodes (disconnected)
  for (const nodeName of graph.nodes.keys()) {
    if (!visited.has(nodeName)) {
      visit(nodeName);
    }
  }

  return order;
}
