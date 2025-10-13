/*
  jQuery Grid UI Editor (no React, no npm)
  - Renders a grid with draggable/resizable items
  - Supports making connections between items or to off-grid targets
  - Draws connections on a full-screen SVG overlay

  Usage: Include jQuery and Tailwind CDN in index.html, then include this script.
*/
(function () {
  const CELL_SIZE = 60;
  const GRID_COLS = 8;
  const GRID_ROWS = 6;

  // Initial data
  let gridItems = [
    { id: '1', x: 0, y: 0, w: 2, h: 2, content: 'Button A', type: 'button' },
    { id: '2', x: 2, y: 0, w: 3, h: 1, content: 'Header', type: 'header' },
    { id: '3', x: 0, y: 2, w: 1, h: 3, content: 'Sidebar', type: 'sidebar' },
  ];

  let connections = [
    { from: '1', to: '2', id: 'conn-1' },
    { from: '2', to: 'modal-target', id: 'conn-2' },
  ];

  const offGridTargets = [
    { id: 'hidden-target', label: 'Hidden', color: 'bg-gray-500' },
    { id: 'modal-target', label: 'Modal', color: 'bg-purple-500' },
    { id: 'tab-target', label: 'Other Tab', color: 'bg-blue-500' },
  ];

  const elementTypes = [
    { type: 'button', label: 'Button', color: 'bg-blue-200' },
    { type: 'header', label: 'Header', color: 'bg-green-200' },
    { type: 'sidebar', label: 'Sidebar', color: 'bg-yellow-200' },
    { type: 'content', label: 'Content', color: 'bg-purple-200' },
    { type: 'footer', label: 'Footer', color: 'bg-gray-200' },
  ];

  // State for interactions
  let isDragging = null; // itemId
  let isResizing = null; // itemId
  let isConnecting = null; // itemId
  let dragOffset = { x: 0, y: 0 };
  let tempConnection = null; // { from, startX, startY, x, y }

  let $gridRoot = null; // grid container ref (jQuery object)

  function buildLayout() {
    const $root = $('#root');
    $root.empty();

    const $page = $('<div class="min-h-screen bg-gray-100 p-6 select-none"></div>');
    const $row = $('<div class="flex gap-6"></div>');

    // Sidebar controls
    const $sidebar = $('<div class="w-64 bg-white rounded-lg shadow-sm p-4"></div>');
    $sidebar.append('<h3 class="font-medium text-gray-700 mb-3">Elements</h3>');

    const $buttonsGrid = $('<div class="grid grid-cols-2 gap-2"></div>');
    elementTypes.forEach(el => {
      const $btn = $('<button class="rounded text-sm py-2 hover:opacity-80 transition-opacity"></button>')
        .addClass(el.color)
        .text(el.label)
        .on('click', () => addItem(el.type));
      $buttonsGrid.append($btn);
    });
    $sidebar.append($buttonsGrid);
    $sidebar.append(`
      <div class="mt-4 text-xs text-gray-500">
        <p>• Drag elements to reposition</p>
        <p>• Drag bottom-right corner to resize</p>
        <p>• Drag right-side circle to connect</p>
      </div>
    `);

    // Grid canvas and off-grid targets column
    const $canvasCol = $('<div class="flex-1"></div>');
    const $canvasCard = $('<div class="relative bg-white rounded-lg shadow-sm p-4"></div>');

    $gridRoot = $('<div class="relative bg-gray-50 rounded-lg"></div>')
      .css({
        width: GRID_COLS * CELL_SIZE,
        height: GRID_ROWS * CELL_SIZE,
        backgroundSize: `${CELL_SIZE}px ${CELL_SIZE}px`,
        backgroundImage: 'linear-gradient(to right, #eee 1px, transparent 1px), linear-gradient(to bottom, #eee 1px, transparent 1px)'
      });

    $canvasCard.append($gridRoot);
    $canvasCol.append($canvasCard);

    const $targets = $('<div class="w-48 bg-white rounded-lg shadow-sm p-4"></div>');
    $targets.append('<h3 class="font-medium text-gray-700 mb-3">Off-Grid Targets</h3>');

    const $targetsList = $('<div class="space-y-2"></div>');
    offGridTargets.forEach(t => {
      const $t = $('<div class="text-white rounded-lg p-3 cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-2"></div>')
        .addClass(t.color)
        .attr('data-connection-target', t.id)
        .append(`<span class="text-sm font-medium">${t.label}</span>`);
      $targetsList.append($t);
    });
    $targets.append($targetsList);

    const $connListWrap = $('<div class="mt-6"></div>');
    $connListWrap.append('<h3 class="font-medium text-gray-700 mb-3">Connections</h3>');
    $connListWrap.append('<div class="space-y-2 max-h-48 overflow-y-auto" data-conn-list></div>');
    $targets.append($connListWrap);

    $row.append($sidebar, $canvasCol, $targets);
    $page.append($row);

    // SVG overlay for connections
    const $svg = $(
      '<svg class="fixed inset-0 pointer-events-none z-50" style="width:100%;height:100%">\
        <defs>\
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">\
            <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />\
          </marker>\
        </defs>\
        <g data-lines></g>\
      </svg>'
    );

    $page.append($svg);

    $root.append($page);

    // Attach document-level listeners once per build
    attachGlobalListeners();

    // Initial render
    renderItems();
    renderConnections();
    renderConnectionList();
  }

  function getGridRect() {
    return $gridRoot && $gridRoot.length ? $gridRoot[0].getBoundingClientRect() : null;
  }

  function getGridPosition(clientX, clientY) {
    const rect = getGridRect();
    if (!rect) return { x: 0, y: 0 };
    const x = Math.floor((clientX - rect.left) / CELL_SIZE);
    const y = Math.floor((clientY - rect.top) / CELL_SIZE);
    return {
      x: Math.max(0, Math.min(x, GRID_COLS - 1)),
      y: Math.max(0, Math.min(y, GRID_ROWS - 1)),
    };
  }

  function checkCollision(item, newX, newY, excludeId) {
    return gridItems.some(existing =>
      existing.id !== excludeId &&
      existing.id !== item.id &&
      newX < existing.x + existing.w &&
      newX + item.w > existing.x &&
      newY < existing.y + existing.h &&
      newY + item.h > existing.y
    );
  }

  function getElementConnectionPoints(item) {
    const rect = getGridRect();
    if (!rect) return {};
    const left = rect.left + item.x * CELL_SIZE;
    const top = rect.top + item.y * CELL_SIZE;
    const width = item.w * CELL_SIZE;
    const height = item.h * CELL_SIZE;
    return {
      top: { x: left + width / 2, y: top },
      right: { x: left + width, y: top + height / 2 },
      bottom: { x: left + width / 2, y: top + height },
      left: { x: left, y: top + height / 2 },
    };
  }

  function getClosestConnectionPoints(fromItem, toItem) {
    const fromPoints = getElementConnectionPoints(fromItem);
    const toPoints = getElementConnectionPoints(toItem);
    let minDistance = Infinity;
    let best = { from: fromPoints.right, to: toPoints.left };
    const fromEntries = Object.values(fromPoints);
    const toEntries = Object.values(toPoints);
    fromEntries.forEach(fp => {
      toEntries.forEach(tp => {
        const dx = (fp && tp) ? (fp.x - tp.x) : 0;
        const dy = (fp && tp) ? (fp.y - tp.y) : 0;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (isFinite(d) && d < minDistance) {
          minDistance = d;
          best = { from: fp, to: tp };
        }
      });
    });
    return best;
  }

  function getOffGridTargetConnectionPoint(targetId) {
    const el = document.querySelector(`[data-connection-target="${targetId}"]`);
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return { x: rect.left, y: rect.top + rect.height / 2 };
  }

  function addItem(type) {
    const newId = (gridItems.length + 1).toString();
    const newItem = { id: newId, x: 0, y: 0, w: 2, h: 2, content: `${type} ${newId}`, type };
    if (!checkCollision(newItem, newItem.x, newItem.y)) {
      gridItems.push(newItem);
    } else {
      outer: for (let y = 0; y < GRID_ROWS; y++) {
        for (let x = 0; x < GRID_COLS; x++) {
          if (!checkCollision(newItem, x, y)) {
            gridItems.push({ ...newItem, x, y });
            break outer;
          }
        }
      }
    }
    renderItems();
    renderConnections();
    renderConnectionList();
  }

  function deleteItem(id) {
    gridItems = gridItems.filter(it => it.id !== id);
    connections = connections.filter(c => c.from !== id && c.to !== id);
    renderItems();
    renderConnections();
    renderConnectionList();
  }

  function addConnection(fromId, toId) {
    connections = connections.concat([{ id: `conn-${Date.now()}`, from: fromId, to: toId }]);
    renderConnections();
    renderConnectionList();
  }

  function deleteConnection(id) {
    connections = connections.filter(c => c.id !== id);
    renderConnections();
    renderConnectionList();
  }

  function getItemStyle(item) {
    return {
      left: item.x * CELL_SIZE + 'px',
      top: item.y * CELL_SIZE + 'px',
      width: item.w * CELL_SIZE + 'px',
      height: item.h * CELL_SIZE + 'px',
    };
  }

  function renderItems() {
    if (!$gridRoot) return;
    $gridRoot.empty();

    gridItems.forEach(item => {
      const $item = $('<div class="absolute bg-blue-100 rounded-lg border border-blue-300 overflow-hidden group"></div>')
        .attr('data-grid-item-id', item.id)
        .css(getItemStyle(item))
        .on('mousedown', (e) => handleMouseDown(e, item.id, 'drag'));

      const $content = $('<div class="p-2 text-sm"></div>').text(item.content);
      const $deleteBtn = $('<button class="absolute top-1 right-1 text-gray-500 hover:text-red-500" title="Delete">✕</button>')
        .on('mousedown', (e) => e.stopPropagation())
        .on('click', () => deleteItem(item.id));

      const $resize = $('<div class="absolute bottom-0 right-0 w-3 h-3 bg-gray-400 cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity"></div>')
        .on('mousedown', (e) => { e.stopPropagation(); handleMouseDown(e, item.id, 'resize'); });

      const $connect = $('<div class="absolute right-0 top-1/2 transform translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-blue-500 rounded-full cursor-crosshair opacity-0 group-hover:opacity-100 transition-opacity border-2 border-white"></div>')
        .on('mousedown', (e) => { e.stopPropagation(); handleMouseDown(e, item.id, 'connect'); });

      $item.append($content, $deleteBtn, $resize, $connect);
      $gridRoot.append($item);
    });
  }

  function renderConnections() {
    const g = document.querySelector('svg [data-lines]');
    if (!g) return;
    g.innerHTML = '';

    connections.forEach(conn => {
      const fromItem = gridItems.find(i => i.id === conn.from);
      if (!fromItem) return;
      const toItem = gridItems.find(i => i.id === conn.to);
      let fromPoint, toPoint;
      if (toItem) {
        const connection = getClosestConnectionPoints(fromItem, toItem);
        fromPoint = connection.from;
        toPoint = connection.to;
      } else {
        const fromPoints = getElementConnectionPoints(fromItem);
        fromPoint = fromPoints.right;
        toPoint = getOffGridTargetConnectionPoint(conn.to);
      }
      if (!fromPoint || !toPoint ||
          typeof fromPoint.x !== 'number' || typeof fromPoint.y !== 'number' ||
          typeof toPoint.x !== 'number' || typeof toPoint.y !== 'number') {
        return;
      }
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(fromPoint.x));
      line.setAttribute('y1', String(fromPoint.y));
      line.setAttribute('x2', String(toPoint.x));
      line.setAttribute('y2', String(toPoint.y));
      line.setAttribute('stroke', '#3b82f6');
      line.setAttribute('stroke-width', '2');
      line.setAttribute('marker-end', 'url(#arrowhead)');
      g.appendChild(line);
    });

    // Temporary connection line
    if (tempConnection) {
      const { startX, startY, x, y } = tempConnection;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(startX));
      line.setAttribute('y1', String(startY));
      line.setAttribute('x2', String(x));
      line.setAttribute('y2', String(y));
      line.setAttribute('stroke', '#3b82f6');
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-dasharray', '5,5');
      line.setAttribute('marker-end', 'url(#arrowhead)');
      g.appendChild(line);
    }
  }

  function renderConnectionList() {
    const $list = $('[data-conn-list]');
    if (!$list.length) return;
    $list.empty();
    connections.forEach(conn => {
      const fromItem = gridItems.find(i => i.id === conn.from);
      const toTarget = offGridTargets.find(t => t.id === conn.to) || gridItems.find(i => i.id === conn.to);
      const fromLabel = fromItem ? fromItem.content : conn.from;
      const toLabel = toTarget ? (toTarget.label || toTarget.content) : conn.to;
      const $row = $('<div class="flex items-center justify-between bg-gray-50 rounded p-2 text-xs"></div>');
      $row.append(`<span>${fromLabel} → ${toLabel}</span>`);
      const $del = $('<button class="text-red-500 hover:text-red-700" title="Delete">✕</button>')
        .on('click', () => deleteConnection(conn.id));
      $row.append($del);
      $list.append($row);
    });
  }

  function handleMouseDown(e, itemId, action) {
    e.preventDefault();
    const item = gridItems.find(i => i.id === itemId);
    if (!item) return;
    if (action === 'drag') {
      const { x, y } = getGridPosition(e.clientX, e.clientY);
      dragOffset = { x: x - item.x, y: y - item.y };
      isDragging = itemId;
    } else if (action === 'resize') {
      isResizing = itemId;
    } else if (action === 'connect') {
      isConnecting = itemId;
      const pts = getElementConnectionPoints(item);
      tempConnection = {
        from: itemId,
        startX: pts.right ? pts.right.x : e.clientX,
        startY: pts.right ? pts.right.y : e.clientY,
        x: e.clientX,
        y: e.clientY,
      };
    }
  }

  function handleMouseMove(e) {
    if (isDragging) {
      const { x, y } = getGridPosition(e.clientX, e.clientY);
      const item = gridItems.find(i => i.id === isDragging);
      if (!item) return;
      const newX = Math.max(0, x - dragOffset.x);
      const newY = Math.max(0, y - dragOffset.y);
      if (!checkCollision(item, newX, newY, isDragging)) {
        item.x = newX; item.y = newY;
        renderItems();
        renderConnections();
      }
    } else if (isResizing) {
      const { x, y } = getGridPosition(e.clientX, e.clientY);
      const item = gridItems.find(i => i.id === isResizing);
      if (!item) return;
      const newW = Math.max(1, Math.min(x - item.x + 1, GRID_COLS - item.x));
      const newH = Math.max(1, Math.min(y - item.y + 1, GRID_ROWS - item.y));
      const tmp = { ...item, w: newW, h: newH };
      if (!checkCollision(tmp, item.x, item.y, isResizing)) {
        item.w = newW; item.h = newH;
        renderItems();
        renderConnections();
      }
    } else if (isConnecting && tempConnection) {
      tempConnection.x = e.clientX;
      tempConnection.y = e.clientY;
      renderConnections();
    }
  }

  function handleMouseUp(e) {
    if (isDragging) {
      isDragging = null;
    } else if (isResizing) {
      isResizing = null;
    } else if (isConnecting) {
      const elements = document.elementsFromPoint(e.clientX, e.clientY) || [];
      const targetItemEl = elements.find(el => el.getAttribute && el.getAttribute('data-grid-item-id'));
      const targetOffGridEl = elements.find(el => el.getAttribute && el.getAttribute('data-connection-target'));
      if (targetItemEl) {
        const toId = targetItemEl.getAttribute('data-grid-item-id');
        if (toId && toId !== isConnecting) addConnection(isConnecting, toId);
      } else if (targetOffGridEl) {
        const toTarget = targetOffGridEl.getAttribute('data-connection-target');
        if (toTarget) addConnection(isConnecting, toTarget);
      }
      isConnecting = null;
      tempConnection = null;
      renderConnections();
    }
  }

  function attachGlobalListeners() {
    // Avoid attaching multiple times
    $(document).off('mousemove.gridui mouseup.gridui');
    $(document).on('mousemove.gridui', handleMouseMove);
    $(document).on('mouseup.gridui', handleMouseUp);
    // Re-render connections on scroll/resize to keep positions accurate
    $(window).off('scroll.gridui resize.gridui');
    $(window).on('scroll.gridui resize.gridui', () => { renderConnections(); });
  }

  $(function () {
    buildLayout();
  });
})();
