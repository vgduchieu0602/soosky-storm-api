import ActiveStormsRepository from "./IActiveStormsRepository.js";
import StormConeRepository from "./IStormConeRepository.js";
import StormTrackRepository from "./IStormTrackRepository.js";

export { StormRepository as default };

interface StormRepository extends ActiveStormsRepository, StormTrackRepository, StormConeRepository {}
