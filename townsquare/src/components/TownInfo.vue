<template>
  <div class="town-info">
    <div
      class="edition"
      :class="['edition-' + edition.id]"
      :style="{
        backgroundImage: `url(${
          edition.logo && grimoire.isImageOptIn
            ? edition.logo
            : require('../assets/editions/' + edition.id + '.png')
        })`,
      }"
    ></div>
    <ul class="info">
      <li v-if="players.length - teams.traveler < 5">
        Please add more players!
      </li>
      <li class="meta-row">
        <span class="meta">
          {{ edition.name }}
          {{
            !edition.isOfficial && edition.author ? "by " + edition.author : ""
          }}
        </span>
      </li>
      <li class="stats-row">
        <span>
          {{ players.length }}
          <font-awesome-icon class="players" icon="users" />
        </span>
        <span>
          {{ teams.alive }}
          <font-awesome-icon class="alive" icon="heartbeat" />
        </span>
        <span>
          {{ teams.votes }} <font-awesome-icon class="votes" icon="vote-yea" />
        </span>
      </li>
      <li class="teams-row" v-if="players.length - teams.traveler >= 5">
        <span>
          {{ teams.townsfolk }}
          <font-awesome-icon class="townsfolk" icon="user-friends" />
        </span>
        <span>
          {{ teams.outsider }}
          <font-awesome-icon
            class="outsider"
            :icon="teams.outsider > 1 ? 'user-friends' : 'user'"
          />
        </span>
        <span>
          {{ teams.minion }}
          <font-awesome-icon
            class="minion"
            :icon="teams.minion > 1 ? 'user-friends' : 'user'"
          />
        </span>
        <span>
          {{ teams.demon }}
          <font-awesome-icon
            class="demon"
            :icon="teams.demon > 1 ? 'user-friends' : 'user'"
          />
        </span>
        <span v-if="teams.traveler">
          {{ teams.traveler }}
          <font-awesome-icon
            class="traveler"
            :icon="teams.traveler > 1 ? 'user-friends' : 'user'"
          />
        </span>
        <span v-if="grimoire.isNight">
          Night phase
          <font-awesome-icon :icon="['fas', 'cloud-moon']" />
        </span>
      </li>
    </ul>
  </div>
</template>

<script>
import gameJSON from "./../game";
import { mapState } from "vuex";

export default {
  computed: {
    teams: function () {
      const { players } = this.$store.state.players;
      const nonTravelers = this.$store.getters["players/nonTravelers"];
      const alive = players.filter((player) => player.isDead !== true).length;
      return {
        ...gameJSON[nonTravelers - 5],
        traveler: players.length - nonTravelers,
        alive,
        votes:
          alive +
          players.filter(
            (player) => player.isDead === true && player.isVoteless !== true,
          ).length,
      };
    },
    ...mapState(["edition", "grimoire"]),
    ...mapState("players", ["players"]),
  },
};
</script>

<style lang="scss" scoped>
@import "../vars.scss";

.info {
  position: fixed;
  top: 10px;
  left: 10px;
  display: flex;
  width: min(460px, calc(100vw - 20px));
  min-height: 64px;
  padding: 0;
  align-items: flex-start;
  align-content: flex-start;
  justify-content: flex-start;
  flex-wrap: wrap;
  z-index: 45;

  li {
    font-weight: bold;
    width: 100%;
    display: flex;
    flex-wrap: nowrap;
    justify-content: flex-start;
    align-items: center;
    gap: 10px;
    overflow-x: auto;
    overflow-y: hidden;
    padding-right: 4px;
    text-shadow:
      0 2px 1px black,
      0 -2px 1px black,
      2px 0 1px black,
      -2px 0 1px black;

    span {
      white-space: nowrap;
    }

    .meta {
      text-align: left;
      font-family: PiratesBay, sans-serif;
      font-weight: normal;
    }

    svg {
      margin-right: 10px;
    }

    .players {
      color: #00f700;
    }
    .alive {
      color: #ff4a50;
    }
    .votes {
      color: #fff;
    }
    .townsfolk {
      color: $townsfolk;
    }
    .outsider {
      color: $outsider;
    }
    .minion {
      color: $minion;
    }
    .demon {
      color: $demon;
    }
    .traveler {
      color: $traveler;
    }
  }

  .meta-row {
    overflow: hidden;
  }

  .stats-row,
  .teams-row {
    font-size: 0.95em;
  }
}

.town-info {
  position: static;
}

.edition {
  width: 220px;
  height: 200px;
  max-width: 100%;
  max-height: 100%;
  background-position: center;
  background-repeat: no-repeat;
  background-size: 100% auto;
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 5;
}
</style>
