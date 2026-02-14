"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataType = exports.EventType = exports.ObjectType = void 0;
// Core object type definitions
var ObjectType;
(function (ObjectType) {
    ObjectType["Table"] = "Table";
    ObjectType["Page"] = "Page";
    ObjectType["Codeunit"] = "Codeunit";
    ObjectType["Report"] = "Report";
    ObjectType["XMLPort"] = "XMLPort";
    ObjectType["Query"] = "Query";
    ObjectType["Enum"] = "Enum";
})(ObjectType || (exports.ObjectType = ObjectType = {}));
var EventType;
(function (EventType) {
    // Table Events
    EventType["OnInsert"] = "OnInsert";
    EventType["OnModify"] = "OnModify";
    EventType["OnDelete"] = "OnDelete";
    EventType["OnRename"] = "OnRename";
    EventType["OnValidate"] = "OnValidate";
    // Page Events
    EventType["OnOpenPage"] = "OnOpenPage";
    EventType["OnClosePage"] = "OnClosePage";
    EventType["OnAfterGetRecord"] = "OnAfterGetRecord";
    EventType["OnNewRecord"] = "OnNewRecord";
    EventType["OnAction"] = "OnAction";
    // Business Events
    EventType["OnBeforePost"] = "OnBeforePost";
    EventType["OnAfterPost"] = "OnAfterPost";
})(EventType || (exports.EventType = EventType = {}));
var DataType;
(function (DataType) {
    DataType["Integer"] = "Integer";
    DataType["BigInteger"] = "BigInteger";
    DataType["Decimal"] = "Decimal";
    DataType["Boolean"] = "Boolean";
    DataType["Text"] = "Text";
    DataType["Code"] = "Code";
    DataType["Date"] = "Date";
    DataType["DateTime"] = "DateTime";
    DataType["Time"] = "Time";
    DataType["Guid"] = "Guid";
    DataType["Duration"] = "Duration";
    DataType["Blob"] = "Blob";
    DataType["Media"] = "Media";
    DataType["MediaSet"] = "MediaSet";
})(DataType || (exports.DataType = DataType = {}));
//# sourceMappingURL=object-types.js.map