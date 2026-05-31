Ext.define('Store.duplicate_online.Module', {
    extend: 'Ext.Component',

    initModule: function() {
        var me = this;

        var navTab = Ext.create('Ext.panel.Panel', {
            title: l('Дубликат Онлайн'),
            iconCls: 'fa fa-copy',
            width: 700,
            layout: 'vbox',
            items: [
                me.buildToolbar(),
                me.buildTree()
            ]
        });

        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'vbox',
            items: [{
                xtype: 'panel', flex: 1,
                html: '<div style="padding:20px;text-align:center;">Верхняя панель (пусто)</div>'
            }, {
                xtype: 'panel', flex: 1,
                html: '<div style="padding:20px;text-align:center;">Нижняя панель (пусто)</div>'
            }]
        });

        navTab.map_frame = mainPanel;
        skeleton.navigation.add(navTab);
        var mapframe = skeleton.mapframe || skeleton.map_frame;
        if (mapframe) mapframe.add(mainPanel);

        me.loadData();
    },

    buildToolbar: function() {
        var me = this;
        return Ext.create('Ext.toolbar.Toolbar', {
            items: [{
                text: 'Обновить',
                handler: function() { me.loadData(); }
            }]
        });
    },

    buildTree: function() {
        var me = this;
        me.store = Ext.create('Ext.data.TreeStore', {
            root: { expanded: true, children: [] }
        });
        me.tree = Ext.create('Ext.tree.Panel', {
            flex: 1,
            store: me.store,
            rootVisible: false,
            columns: [{
                xtype: 'treecolumn',
                text: 'Папки и объекты',
                dataIndex: 'text',
                flex: 1
            }]
        });
        return me.tree;
    },

    loadData: function() {
        var me = this;
        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: { vehs: 1, state: 1 },  // ⚠️ временные параметры
            success: function(resp) {
                var data = Ext.decode(resp.responseText);
                var root = me.store.getRootNode();
                root.removeAll();
                me.addNodes(root, data);
                root.expandChildren(true, false);
            }
        });
    },

    addNodes: function(parent, nodes) {
        if (!Ext.isArray(nodes)) nodes = [nodes];
        Ext.each(nodes, function(node) {
            var child = parent.appendChild({
                text: node.name || node.text || node.id,
                leaf: !node.children || node.children.length === 0
            });
            if (node.children && node.children.length) this.addNodes(child, node.children);
        }, this);
    }
});
