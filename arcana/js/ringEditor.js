window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.ringEditor = {
  render() {
    ArcanaApp.equipmentEditor.render();
  },

  collect() {
    const equipment = ArcanaApp.equipmentEditor.collect();
    return {
      ring1: equipment.ring1 || [],
      ring2: equipment.ring2 || []
    };
  }
};
