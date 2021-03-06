const path = require("path");
const utils = new (require('./utils.js').utils)();
const fs = require('fs');
function DBManager(ctx) {
    function dbwrapper (func){
        return function(...args){
            BS3 = require('better-sqlite3');
            try{
                db = BS3(path.join(ctx.configSettings.libpath, 'pa.db'));
            }catch(err){
                alert("Cannot open the database " + path.join(ctx.configSettings.libpath, 'pa.db'));
                return;
            }
            ctx.dbTableName = "docInfoTable";
            db.prepare("create table if not exists " + ctx.dbTableName + "(name text NOT NULL PRIMARY KEY, title text, authors text, year text, journal text, tags text, comment text, addTime datetime, updateTime datetime, content text)").run();
            this.db = db;

            func(...args);

            this.db.close();
        };
    };

    _exteactTags = function(tableData, key){
        var tags = tableData.map(x => x[key].split(","));
        tags = Array.prototype.concat.apply([], tags);
        tags = tags.map(x => x.trim()).filter(x => x.length > 0);
        var counts = {};
        for (var i = 0; i < tags.length; i++) {
          counts[tags[i]] = counts[tags[i]] ? counts[tags[i]] + 1 : 1;
        }
        return counts;
    }
    this.loadFullData = dbwrapper(function() {
        if(typeof(this.db) !== undefined)ctx.tableData = this.db.prepare("SELECT * FROM docInfoTable").all();
        //ctx.tagCounts = _exteactTags(ctx.tableData, "tags");
        //ctx.journalCounts = _exteactTags(ctx.tableData, "journal");
    });
    _insertItem = dbwrapper(function(itemInfo, srcPath, dstPath){
        keys = Object.keys(itemInfo);
        values = "('" + keys.map(x => itemInfo[x].toString().replace(/\'/g, "''")).join("', '") + "')";
        keys = "(" + keys.join(', ') + ")";
        this.db.prepare("insert into " + ctx.dbTableName + keys + " values  " + values + ";").run();
        if(srcPath != dstPath){
          fs.writeFileSync(dstPath, fs.readFileSync(srcPath));
          fs.unlink(srcPath, function (err) {
              if (err) ctx.warn("原始文件" + srcPath + "已打开，无法移动，已复制副本到库");
          });
        }
    });
    _deleteItem = dbwrapper(function (name){
        this.db.prepare("delete from " + ctx.dbTableName + " where name='" + name + "';").run();
    });
    this.InsertItemInfo = dbwrapper(function() {
        ctx.itemEditFormDataStandard = utils.deepcopy(ctx.ctor.itemEditFormData);
        var itemInfo = ctx.itemEditFormDataStandard;
        if (this.db.prepare("select name from " + ctx.dbTableName + " where name = '" + itemInfo.name + "';").all().length != 0) {
            ctx.error("有同名文件" + itemInfo.name + "存在！请编辑名称。");
            ctx.ctor.itemEditFormVisible = true;
            return -1;
        }
        _insertItem(itemInfo, ctx.itemEditFilePath, path.join(ctx.configSettings.libpath, ctx.itemEditFormDataStandard.name));
        ctx.tableData.push(ctx.itemEditFormDataStandard);
        ctx.ctor.tableData = utils.partialCopyArray(ctx.tableData, ctx.showKeys);
        return 0;
    });
    this.updateItemInfo = function(oriName){
        var tzoffset = (new Date()).getTimezoneOffset() * 60000;
        ctx.ctor.itemEditFormData.updateTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, -5).replace('T', ' ');
        ctx.itemEditFormDataStandard = utils.deepcopy(ctx.ctor.itemEditFormData);
        var findItemId = 0;
        for(;findItemId < ctx.tableData.length && ctx.tableData[findItemId].name !== oriName; ++findItemId);
        if(findItemId >= ctx.tableData.length){ctx.error('数据库中找不到该文件，请重启程序！');return;};
        for(var x in ctx.itemEditFormDataStandard){
            ctx.tableData[findItemId][x] = ctx.itemEditFormDataStandard[x];
        }
        _deleteItem(oriName);
        _insertItem(ctx.itemEditFormDataStandard, path.join(ctx.configSettings.libpath, oriName), path.join(ctx.configSettings.libpath, ctx.itemEditFormDataStandard.name));
        ctx.ctor.tableData = utils.partialCopyArray(ctx.tableData, ctx.showKeys);
    }
    this.deleteItemInfo = function(name){
        _deleteItem(name);
        fs.unlink(path.join(ctx.configSettings.libpath, name), function (err) {
            if (err) ctx.warn("文件" + path.join(ctx.configSettings.libpath, name) + "无法删除，请关闭后手动删除文件");
        });
        var findItemId = 0;
        for(;findItemId < ctx.tableData.length && ctx.tableData[findItemId].name !== name; ++findItemId);
        ctx.tableData.splice(findItemId, 1);
        ctx.ctor.tableData = utils.partialCopyArray(ctx.tableData, ctx.showKeys);
    },
    this.searchItemInfo = function(searchText){
      ctx.ctor.tableData = [];
      var regEx = new RegExp('(' + searchText + ')', "ig");
      function searchAndReplace(attrList, newRow){
        for (let key in ctx.showKeys){
            newRow[attrList[key]] = '<p>' + newRow[attrList[key]].toString().replace(regEx, '<font color="red">$1</font>') + '</p>';
        }
        return newRow;
      }
      for (let key in ctx.tableData) {
        if(ctx.showKeys.some(function (x){return utils.strContain(ctx.tableData[key][x], searchText)})){
          var newRow = utils.partialCopy(ctx.tableData[key], ctx.showKeys);
          ctx.ctor.tableData.push(searchAndReplace(ctx.showKeys, newRow));
        }
      }
    }
}

module.exports = {
    DBManager: DBManager
}
