// SNIPPET: Replace populateRouteList function with this simplified version

function populateRouteList(routes, routeLayers) {
  const routeList = document.getElementById('routeList');
  if (!routeList) return;
  routeList.innerHTML = '';

  const routeColors = ['#16a34a', '#e63946', '#457b9d', '#f4a261', '#2a9d8f'];

  routes.forEach((route, i) => {
    const distKm = (route.distance / 1000).toFixed(2);
    const durMin = Math.round(route.duration / 60);
    const color = routeColors[i % routeColors.length];

    const item = document.createElement('button');
    item.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 20px; height: 20px; border-radius: 3px; background: ${color};"></div>
          <div style="font-weight: 600; font-size: 13px;">Route ${i + 1}</div>
          ${i === 0 ? '<span style="font-size: 10px; background: #16a34a; color: white; padding: 2px 6px; border-radius: 3px;">Recommended</span>' : ''}
        </div>
        <div style="font-size: 12px; color: #555; font-weight: 500;">
          ${distKm} km | ${durMin} min
        </div>
      </div>
    `;

    item.style.cssText = `
      display: block;
      width: 100%;
      padding: 10px 12px;
      margin-bottom: 8px;
      background: ${i === 0 ? color + '12' : '#f9fafb'};
      border: 2px solid ${color};
      border-radius: 6px;
      cursor: pointer;
      text-align: left;
      font-size: 13px;
      transition: all 0.2s ease;
    `;

    item.onmouseover = () => {
      item.style.background = color + '20';
      item.style.transform = 'translateX(2px)';
    };

    item.onmouseout = () => {
      item.style.background = i === 0 ? color + '12' : '#f9fafb';
      item.style.transform = 'translateX(0)';
    };

    item.onclick = () => {
      routeLayers.forEach((layer) => {
        const layerIdx = typeof layer._routeIndex === 'number' ? layer._routeIndex : null;
        if (layerIdx === null) return;
        if (layerIdx === i) {
          layer.setStyle({ weight: 6, opacity: 1, color: color, dashArray: null });
          map.fitBounds(layer.getBounds(), { padding: [40, 40] });
        } else {
          const altColor = routeColors[layerIdx % routeColors.length];
          layer.setStyle({ weight: 3, opacity: 0.3, color: altColor, dashArray: "5,8" });
        }
      });
    };

    routeList.appendChild(item);
  });
}
