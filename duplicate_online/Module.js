Ext.define('Store.duplicate_online.Module', {
    extend: 'Ext.Component',

    initModule: function() {
        var me = this;

        var navTab = Ext.create('Ext.panel.Panel', {
            title: l('Дубликат Онлайн'),
            iconCls: 'fa fa-copy',
            width: 700,
            layout: 'vbox',
            border: false,
            items: [me.buildFilterToolbar(), me.buildTreePanel()]
        });

        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'vbox',
            border: false,
            items: [{
                xtype: 'panel',
                flex: 1,
                bodyPadding: 10,
                html: '<div style="text-align:center; color:#aaa;">Верхняя панель (пусто)</div>'
            }, {
                xtype: 'panel',
                flex: 1,
                bodyPadding: 10,
                html: '<div style="text-align:center; color:#aaa;">Нижняя панель (пусто)</div>'
            }]
        });

        navTab.map_frame = mainPanel;
        skeleton.navigation.add(navTab);
        var mapframe = skeleton.mapframe || skeleton.map_frame;
        if (mapframe) mapframe.add(mainPanel);
    },

    buildFilterToolbar: function() {
        var me = this;
        var toolbar = Ext.create('Ext.toolbar.Toolbar', {
            items: [{
                text: l('Все'), stateValue: 'all', enableToggle: true, toggleGroup: 'statefilter', pressed: true,
                handler: function(btn) { me.filterByState(btn, 'all'); }
            }, {
                text: l('Активные'), stateValue: 1, enableToggle: true, toggleGroup: 'statefilter',
                handler: function(btn) { me.filterByState(btn, 1); }
            }, {
                text: l('Аварии'), stateValue: 2, enableToggle: true, toggleGroup: 'statefilter',
                handler: function(btn) { me.filterByState(btn, 2); }
            }, {
                text: l('Стоянка'), stateValue: 3, enableToggle: true, toggleGroup: 'statefilter',
                handler: function(btn) { me.filterByState(btn, 3); }
            }, {
                text: l('Холостой ход'), stateValue: 4, enableToggle: true, toggleGroup: 'statefilter',
                handler: function(btn) { me.filterByState(btn, 4); }
            }, '->', {
                xtype: 'textfield', emptyText: l('Поиск...'), enableKeyEvents: true,
                listeners: { keyup: function(field) { me.applySearchFilter(field.getValue()); } }
            }]
        });
        me.searchField = toolbar.items.last();
        return toolbar;
    },

    buildTreePanel: function() {
        var me = this;
        me.treeStore = Ext.create('Ext.data.TreeStore', { root: { expanded: true, children: [] } });
        me.tree = Ext.create('Ext.tree.Panel', {
            flex: 1, store: me.treeStore, rootVisible: false, useArrows: true, lines: true,
            columns: [{
                xtype: 'treecolumn', text: l('Объекты'), dataIndex: 'text', flex: 2,
                renderer: function(v, m, rec) { return v || rec.get('name') || rec.get('id'); }
            }, {
                text: l('Статус'), dataIndex: 'state', width: 110,
                renderer: function(v) { return v ? (v===1?'Активен':'Другой') : '—'; }
            }, {
                text: l('Обновлено'), dataIndex: 'last_update', width: 140,
                renderer: function(v) { return v ? (typeof v==='number'?Ext.Date.format(new Date(v*1000),'d.m.Y H:i:s'):v) : '—'; }
            }, {
                text: l('Тип'), dataIndex: 'equip_type', width: 100,
                renderer: function(v) { return v || '—'; }
            }, {
                text: l('Скорость'), dataIndex: 'speed', width: 90,
                renderer: function(v) { return v !== undefined ? v + ' км/ч' : '—'; }
            }],
            viewConfig: { stripeRows: true, loadMask: true }
        });
        me.loadTreeData('all');
        return me.tree;
    },

    loadTreeData: function(stateValue) {
        var me = this;
        var stateParam = (stateValue === 'all') ? 1 : stateValue;
        // ИСПРАВЛЕНИЕ: добавлены возможные параметры, которые могут включить ТС
        var params = {
            vehs: 1,
            state: stateParam,
            objects: 1,    // возможно, включает объекты
            units: 1,      // возможно, включает юниты
            vehicles: 1    // возможно, включает ТС
        };
        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: params,
            success: function(response) {
                var data = Ext.decode(response.responseText);
                console.log('Ответ сервера (с расширенными параметрами):', data);
                if (!data || (Ext.isArray(data) && data.length === 0)) {
                    Ext.Msg.alert('Внимание', 'Нет данных. Убедитесь, что в параметрах запроса переданы правильные поля (objects, vehicles, units).');
                }
                var root = me.treeStore.getRootNode();
                root.removeAll();
                me.addNodesToTree(root, data);
                root.expandChildren(true, false);
                me.applySearchFilter(me.searchField.getValue());
            },
            failure: function() { Ext.Msg.alert('Ошибка', 'Не удалось загрузить данные'); }
        });
    },

    addNodesToTree: function(parentNode, children) {
        if (!Ext.isArray(children)) children = [children];
        var me = this;
        Ext.each(children, function(item) {
            var nodeText = item.text || item.name || (item.id ? 'ID ' + item.id : '?');
            var isLeaf = !item.children || item.children.length === 0;
            var nodeConfig = {
                text: nodeText, leaf: isLeaf, expanded: false,
                id: item.id, state: item.state, last_update: item.last_update,
                equip_type: item.equip_type, speed: item.speed
            };
            var node = parentNode.appendChild(nodeConfig);
            if (item.children && item.children.length) me.addNodesToTree(node, item.children);
        });
    },

    filterByState: function(btn, stateValue) { this.loadTreeData(stateValue); },
    applySearchFilter: function(query) {
        var me = this, root = me.treeStore.getRootNode();
        if (!root) return;
        root.cascadeBy(function(n) { n.set('visible', true); });
        if (!query || query.length < 2) return;
        var lower = query.toLowerCase();
        root.cascadeBy(function(n) { if (n !== root) n.set('visible', false); });
        root.cascadeBy(function(n) {
            if (n !== root && (n.get('text')||'').toLowerCase().indexOf(lower) !== -1) {
                n.set('visible', true);
                var p = n.parentNode;
                while (p && p !== root) { p.set('visible', true); p = p.parentNode; }
            }
        });
    }
});
