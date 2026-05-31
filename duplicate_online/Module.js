Ext.define('Store.duplicate_online.Module', {
    extend: 'Ext.Component',

    initModule: function() {
        // 1. Создаём левую панель (вкладка)
        var navTab = Ext.create('Ext.panel.Panel', {
            title: 'Дубликат Онлайн',
            iconCls: 'fa fa-copy',
            width: 400,
            layout: 'fit',
            items: [this.createTree()]
        });

        // 2. Правая панель (пустая, разделённая)
        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'vbox',
            items: [
                { xtype: 'panel', flex: 1, html: 'Верхняя панель (пусто)' },
                { xtype: 'panel', flex: 1, html: 'Нижняя панель (пусто)' }
            ]
        });

        navTab.map_frame = mainPanel;
        skeleton.navigation.add(navTab);
        (skeleton.mapframe || skeleton.map_frame).add(mainPanel);
    },

    createTree: function() {
        // Простое дерево с одной колонкой
        this.store = Ext.create('Ext.data.TreeStore', {
            root: { expanded: true, children: [] },
            proxy: {
                type: 'ajax',
                url: '/ax/tree.php',
                extraParams: { vehs: 1, state: 1 },
                reader: { type: 'json', rootProperty: '' }
            }
        });
        return Ext.create('Ext.tree.Panel', {
            store: this.store,
            rootVisible: false,
            columns: [{ xtype: 'treecolumn', text: 'Объекты', dataIndex: 'text', flex: 1 }]
        });
    }
});
