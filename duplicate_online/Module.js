Ext.define('Store.duplicate_online.Module', {
    extend: 'Ext.Component',

    initModule: function() {
        var me = this;

        var navTab = Ext.create('Ext.panel.Panel', {
            title: 'Дубликат Онлайн',
            iconCls: 'fa fa-copy',
            width: 950,
            layout: 'border',
            items: [{
                region: 'north',
                height: 40,
                items: [me.buildToolbar()]
            }, {
                region: 'center',
                items: [me.buildTree()]
            }]
        });

        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'vbox',
            items: [{
                xtype: 'panel',
                flex: 1,
                layout: 'fit',
                html: '<div id="dup-online-map" style="width:100%;height:100%;"></div>'
            }, {
                xtype: 'panel',
                flex: 1,
                bodyPadding: 10,
                html: '<div style="text-align:center;">Нижняя панель (пусто)</div>'
            }]
        });

        navTab.map_frame = mainPanel;
        skeleton.navigation.add(navTab);
        if (skeleton.navigation.setActiveTab) skeleton.navigation.setActiveTab(navTab);
        if (skeleton.mapframe) skeleton.mapframe.add(mainPanel);

        setTimeout(function() {
            skeleton.navigation.updateLayout();
            if (skeleton.mapframe) skeleton.mapframe.updateLayout();
            navTab.updateLayout();
            me.loadTreeData(); // первая загрузка
            // Автообновление каждые 30 секунд
            setInterval(function() {
                if (me.treeStore && !me.treeStore.isLoading()) {
                    me.loadTreeData();
                }
            }, 30000);
        }, 100);

        setTimeout(function() { me.initMap(); }, 200);
    },

    buildToolbar: function() {
        var me = this;
        return Ext.create('Ext.toolbar.Toolbar', {
            items: ['->', {
                xtype: 'textfield',
                emptyText: 'Поиск...',
                enableKeyEvents: true,
                width: 200,
                listeners: {
                    keyup: function(field) {
                        me.applySearchFilter(field.getValue());
                    }
                }
            }]
        });
    },

    loadTreeData: function() {
        var me = this;
        Ext.Ajax.request({
            url: '/backend/ax/tree.php',
            params: {
                vehs: 1,
                state: 1,
                objects: 1,
                vehicles: 1,
                full: 1,
                units: 1,
                devs: 1
            },
            success: function(response) {
                var data = Ext.decode(response.responseText);
                // Диагностика: вывести первое ТС с его полями
                if (data && data.length > 0) {
                    var firstVehicle = me.findFirstVehicle(data);
                    if (firstVehicle) {
                        console.log('Доступные поля объекта:', Object.keys(firstVehicle));
                        console.log('Пример объекта:', firstVehicle);
                    }
                }
                var root = me.treeStore.getRootNode();
                root.removeAll();
                me.buildTreeFromData(root, data);
                root.expandChildren(true, false);
                me.tree.getView().refresh();
                me.applySearchFilter(me.searchField ? me.searchField.getValue() : '');
            },
            failure: function() {
                Ext.Msg.alert('Ошибка', 'Не удалось загрузить данные');
            }
        });
    },

    findFirstVehicle: function(nodes) {
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            if (node.leaf || !node.children || node.children.length === 0) {
                if (node.id && typeof node.id === 'number') return node;
            }
            if (node.children && node.children.length) {
                var found = this.findFirstVehicle(node.children);
                if (found) return found;
            }
        }
        return null;
    },

    buildTreeFromData: function(parentNode, children) {
        var me = this;
        if (!Ext.isArray(children)) children = [children];
        Ext.each(children, function(child) {
            var isLeaf = child.leaf || !child.children || child.children.length === 0;
            // Определяем поле времени: last_update, msgtime, updated, или created_time
            var updateField = child.last_update || child.msgtime || child.updated || child.created_time;
            var nodeConfig = {
                text: child.name || child.text || child.id,
                name: child.name,
                leaf: isLeaf,
                active: child.active,
                on: child.on,
                configuration: child.configuration,
                uniqid: child.uniqid,
                last_update: updateField,
                id: child.id
            };
            var node = parentNode.appendChild(nodeConfig);
            if (child.children && child.children.length) {
                me.buildTreeFromData(node, child.children);
            }
        });
    },

    buildTree: function() {
        var me = this;
        me.treeStore = Ext.create('Ext.data.TreeStore', {
            root: { expanded: true, children: [] }
        });
        me.tree = Ext.create('Ext.tree.Panel', {
            store: me.treeStore,
            rootVisible: false,
            columns: [{
                xtype: 'treecolumn',
                text: 'Объекты',
                dataIndex: 'text',
                flex: 2,
                renderer: function(v, meta, record) {
                    return v || record.get('name') || record.get('id') || '—';
                }
            }, {
                text: 'Статус',
                dataIndex: 'active',
                width: 100,
                renderer: function(v, meta, record) {
                    if (!record.isLeaf()) return '';
                    var active = record.get('active');
                    var on = record.get('on');
                    if (active === 1 && on === 1) return '<span style="color:green;">● Активен</span>';
                    if (active === 1 && on === 0) return '<span style="color:orange;">⏸ Офлайн</span>';
                    if (active === 0) return '<span style="color:gray;">◯ Неактивен</span>';
                    return '—';
                }
            }, {
                text: 'Обновление',
                dataIndex: 'last_update',
                width: 140,
                renderer: function(v) {
                    if (!v) return '—';
                    if (typeof v === 'number') return Ext.Date.format(new Date(v * 1000), 'd.m.Y H:i:s');
                    if (typeof v === 'string') return v;
                    return '—';
                }
            }, {
                text: 'Тип оборудования',
                dataIndex: 'configuration',
                width: 100,
                renderer: function(v) {
                    return v || '—';
                }
            }, {
                text: 'IMEI',
                dataIndex: 'uniqid',
                width: 150,
                renderer: function(v) {
                    return v || '—';
                }
            }],
            style: 'border: 1px solid #ccc;'
        });
        me.searchField = Ext.ComponentQuery.query('textfield', me.tree.up())[0];
        return me.tree;
    },

    applySearchFilter: function(query) {
        var root = this.treeStore.getRootNode();
        if (!root) return;
        root.cascadeBy(function(node) { node.set('visible', true); });
        if (!query || query.length < 2) return;
        var lower = query.toLowerCase();
        root.cascadeBy(function(node) { if (node !== root) node.set('visible', false); });
        root.cascadeBy(function(node) {
            if (node !== root) {
                var text = (node.get('text') || node.get('name') || '').toLowerCase();
                if (text.indexOf(lower) !== -1) {
                    node.set('visible', true);
                    var p = node.parentNode;
                    while (p && p !== root) { p.set('visible', true); p = p.parentNode; }
                }
            }
        });
    },

    initMap: function() {
        var container = document.getElementById('dup-online-map');
        if (!container) return;
        if (window.MapContainer) {
            this.map = new MapContainer('dup_map');
            this.map.init(55.75, 37.65, 10, 'dup-online-map', false);
        } else if (typeof L !== 'undefined') {
            this.map = L.map('dup-online-map').setView([55.75, 37.65], 10);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
        } else {
            container.innerHTML = '<div style="padding:20px;">Карта не доступна</div>';
        }
    }
});
