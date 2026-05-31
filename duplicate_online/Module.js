Ext.define('Store.duplicate_online.Module', {
    extend: 'Ext.Component',

    initModule: function() {
        var me = this;

        // Левая панель (вкладка)
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

        // Правая панель: карта сверху, пустая панель снизу
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

        // Принудительное обновление макетов и загрузка данных
        setTimeout(function() {
            skeleton.navigation.updateLayout();
            if (skeleton.mapframe) skeleton.mapframe.updateLayout();
            navTab.updateLayout();
            me.loadFullData(); // Запускаем новую комбинированную загрузку данных
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

    // Поиск первого транспортного средства в дереве
    findFirstVehicle: function(records) {
        for (var i = 0; i < records.length; i++) {
            var node = records[i];
            if (node.isLeaf()) return node;
            if (node.childNodes && node.childNodes.length) {
                var found = this.findFirstVehicle(node.childNodes);
                if (found) return found;
            }
        }
        return null;
    },

    // Загрузка и объединение данных из двух источников
    loadFullData: function() {
        var me = this;
        Ext.Ajax.request({
            url: '/backend/ax/tree.php',
            params: {
                vehs: 1, state: 1, objects: 1, vehicles: 1, full: 1
            },
            success: function(treeResponse) {
                var treeData = Ext.decode(treeResponse.responseText);
                // Запрашиваем актуальные статусные данные
                Ext.Ajax.request({
                    url: '/backend/ax/current_data.php',
                    method: 'POST',
                    params: {
                        cmd: 'getData',
                        vehicles: 1,
                        with_last: 1
                    },
                    success: function(statusResponse) {
                        var statusData = Ext.decode(statusResponse.responseText);
                        me.processAndDisplayData(treeData, statusData);
                    },
                    failure: function() {
                        console.error('Не удалось загрузить статусные данные, отображаем только дерево.');
                        me.processAndDisplayData(treeData, {});
                    }
                });
            },
            failure: function() {
                console.error('Не удалось загрузить данные дерева.');
                Ext.Msg.alert('Ошибка', 'Не удалось загрузить данные.');
            }
        });
    },

    // Основной движок: объединяет дерево объектов с актуальными статусами
    processAndDisplayData: function(treeData, statusData) {
        var me = this;
        if (!me.treeStore) {
            me.treeStore = Ext.create('Ext.data.TreeStore', { root: { expanded: true, children: [] } });
            me.tree = Ext.create('Ext.tree.Panel', {
                store: me.treeStore, rootVisible: false,
                columns: [{
                    xtype: 'treecolumn', text: 'Объекты', dataIndex: 'name', flex: 2,
                    renderer: function(v, meta, record) { return v || record.get('text') || record.get('id') || '—'; }
                }, { text: 'Статус', dataIndex: 'active', width: 100, renderer: me.renderStatus },
                  { text: 'Обновление', dataIndex: 'last_connection', width: 140, renderer: me.renderDateTime },
                  { text: 'Тип оборудования', dataIndex: 'configuration', width: 100,
                    renderer: function(v) { return v || '—'; } },
                  { text: 'IMEI', dataIndex: 'uniqid', width: 150,
                    renderer: function(v) { return v || '—'; } }],
                style: 'border: 1px solid #ccc;'
            });
            var navPanel = Ext.ComponentQuery.query('panel[title="Дубликат Онлайн"]')[0];
            if (navPanel && navPanel.items && navPanel.items.getAt(0) && navPanel.items.getAt(0).items) {
                navPanel.items.getAt(0).items.add(me.tree);
                navPanel.updateLayout();
            }
        }

        var root = me.treeStore.getRootNode();
        root.removeAll();
        // Строим дерево, сразу обогащая узлы данными из статусного ответа
        me.buildTreeNodes(root, treeData, statusData);
        root.expandChildren(true, false);
        if (me.tree.getView()) me.tree.getView().refresh();
        if (me.tree.setHeight) me.tree.setHeight(navTab.getHeight() - 50);
    },

    // Рекурсивное построение узлов дерева
    buildTreeNodes: function(parentNode, children, statusData) {
        if (!Ext.isArray(children)) children = [children];
        var me = this;
        Ext.each(children, function(item) {
            // Определяем, является ли узел транспортным средством
            var isVehicle = item.vehid && item.active !== undefined;
            var nodeConfig = {
                name: item.name || item.text || item.id || '—',
                leaf: isVehicle || !item.children || item.children.length === 0,
                expanded: false,
                // Копируем основные поля
                id: item.id, vehid: item.vehid, active: item.active, on: item.on,
                configuration: item.configuration, uniqid: item.uniqid
            };
            // Если есть статусные данные для данного ТС, обогащаем узел
            if (statusData && statusData[item.vehid]) {
                Ext.apply(nodeConfig, {
                    last_connection: statusData[item.vehid].last_connection,
                    last_data: statusData[item.vehid].last_data,
                    status_text: statusData[item.vehid].status_text
                });
            }
            var node = parentNode.appendChild(nodeConfig);
            if (item.children && item.children.length) {
                me.buildTreeNodes(node, item.children, statusData);
            }
        });
    },

    // Рендерер статуса
    renderStatus: function(v, meta, record) {
        if (!record.isLeaf()) return '';
        var active = record.get('active');
        var on = record.get('on');
        if (active === 1 && on === 1) return '<span style="color:green;">● Активен</span>';
        if (active === 1 && on === 0) return '<span style="color:orange;">⏸ Офлайн</span>';
        if (active === 0) return '<span style="color:gray;">◯ Неактивен</span>';
        return '—';
    },

    // Рендерер даты и времени (универсальный)
    renderDateTime: function(v) {
        if (!v) return '—';
        var timestamp = null;
        if (typeof v === 'number') timestamp = v;
        else if (typeof v === 'string') timestamp = parseInt(v);
        if (timestamp && !isNaN(timestamp)) {
            if (timestamp > 10000000000) timestamp = timestamp / 1000;
            return Ext.Date.format(new Date(timestamp * 1000), 'd.m.Y H:i:s');
        }
        return v;
    },

    // ... (остальные методы applySearchFilter, initMap, buildToolbar без изменений) ...
    // Важно: скопируйте и сюда их содержимое из вашего текущего файла для полноты.
});
