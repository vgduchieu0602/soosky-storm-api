import mongoose from "mongoose";

export {
    AlertDeliveryModel,
    DeviceModel,
    RegionSubscriptionModel,
    StormStateModel,
    StormSubscriptionModel,
};

const deviceSchema = new mongoose.Schema({
    deviceToken: { type: String, required: true, unique: true },
}, {
    collection: "devices",
    timestamps: true,
    versionKey: false,
});

const stormSubscriptionSchema = new mongoose.Schema({
    deviceToken: { type: String, required: true },
    stormId: { type: String, required: true },
    // Episode-free identity, so a GDACS episode bump keeps the subscription valid.
    trackingId: { type: String, required: true },
}, {
    collection: "storm_subscriptions",
    timestamps: true,
    versionKey: false,
});

// One row per device and storm; the pair is what "already subscribed" means.
stormSubscriptionSchema.index({ deviceToken: 1, stormId: 1 }, { unique: true });
stormSubscriptionSchema.index({ trackingId: 1 });

const regionSubscriptionSchema = new mongoose.Schema({
    deviceToken: { type: String, required: true, unique: true },
    lat: { type: Number, required: true },
    lon: { type: Number, required: true },
    radiusKm: { type: Number, required: true },
}, {
    collection: "region_subscriptions",
    timestamps: true,
    versionKey: false,
});

const stormStateSchema = new mongoose.Schema({
    trackingId: { type: String, required: true, unique: true },
    stormId: { type: String, required: true },
    name: { type: String, required: true },
    lat: { type: Number, required: true },
    lon: { type: Number, required: true },
    windSpeed: { type: Number, default: null },
    category: { type: String, required: true },
    alertLevel: { type: String, default: null },
    bearing: { type: Number, default: null },
}, {
    collection: "storm_states",
    timestamps: true,
    versionKey: false,
});

const alertDeliverySchema = new mongoose.Schema({
    deviceToken: { type: String, required: true },
    alertKey: { type: String, required: true },
    // The alert key's tracking ID, so a dissipated storm's records can be dropped.
    stormId: { type: String, required: true },
}, {
    collection: "alert_deliveries",
    timestamps: true,
    versionKey: false,
});

// One row per device and exact alert occurrence; the insert failing means "already sent".
alertDeliverySchema.index({ deviceToken: 1, alertKey: 1 }, { unique: true });
alertDeliverySchema.index({ stormId: 1 });

const DeviceModel = mongoose.model("Device", deviceSchema);
const StormStateModel = mongoose.model("StormState", stormStateSchema);
const AlertDeliveryModel = mongoose.model("AlertDelivery", alertDeliverySchema);
const StormSubscriptionModel = mongoose.model("StormSubscription", stormSubscriptionSchema);
const RegionSubscriptionModel = mongoose.model("RegionSubscription", regionSubscriptionSchema);
