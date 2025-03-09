import { useEffect, useState } from "react";
import './App.css';

function App() {
    const [guideText, setGuideText] = useState("To start using Transporter, we need you to login to Spotify.");
    const [hideSpotifyButton, setHideSpotifyButton] = useState(false);
    const [spotifyAllSongs, setSpotifyAllSongs] = useState([]);
    const [progress, setProgress] = useState(0);
    const [isLoading, setIsLoading] = useState(false);


    const generateCodeVerifier = () => {
        const array = new Uint8Array(32);
        window.crypto.getRandomValues(array);
        return btoa(String.fromCharCode(...array)) // Convert to Base64
            .replace(/\+/g, "-") // Convert "+" to "-"
            .replace(/\//g, "_") // Convert "/" to "_"
            .replace(/=+$/, ""); // Remove "=" padding
    };

    const generateCodeChallenge = async (verifier) => {
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const digest = await window.crypto.subtle.digest("SHA-256", data);
        return btoa(String.fromCharCode(...new Uint8Array(digest)))
            .replace(/\+/g, "-") // Convert "+" to "-"
            .replace(/\//g, "_") // Convert "/" to "_"
            .replace(/=+$/, ""); // Remove "=" padding
    };

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get("code");

        if (code && !localStorage.getItem("spotify_access_token")) {
            exchangeCodeForToken(code);
        }

        if (localStorage.getItem("spotify_access_token")) {
            setGuideText("You are now logged in with Spotify.");
            setHideSpotifyButton(true);
            fetchAllUserSongs(); // start getting all spotify songs 
        } else {
            setHideSpotifyButton(false);
        }
    }, []);

    const exchangeCodeForToken = async (code) => {
        const clientId = "e5e198164ca9473187d806fe04a420ba";
        const redirectUri = import.meta.env.REACT_APP_SPOTIFY_REDIRECT_URI || "http://localhost:5173/redirect";
        const codeVerifier = localStorage.getItem("spotify_code_verifier");

        console.log("Exchanging code for token");
        console.log("spotify code verifier", codeVerifier);

        const tokenUrl = "https://accounts.spotify.com/api/token";

        const body = new URLSearchParams({
            client_id: clientId,
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
        });

        try {
            const response = await fetch(tokenUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: body.toString(),
            });

            const data = await response.json();
            console.log("Spotify Auth Response:", data);

            if (data.access_token) {
                localStorage.setItem("spotify_access_token", data.access_token);
                localStorage.removeItem("spotify_code_verifier");

                setGuideText("You are now logged in with Spotify.");
                setHideSpotifyButton(true);

                cleanUpURL();
            } else {
                //TODO
            }
        } catch (error) {
            console.error("Error during Spotify login:", error);
        }
    };

    const fetchSpotifyProfile = async () => {
        const token = localStorage.getItem("spotify_access_token");

        const response = await fetch("https://api.spotify.com/v1/me", {
            headers: { Authorization: `Bearer ${token}` },
        });

        const data = await response.json();
        console.log("User Profile:", data);
    };

    const handleLogin = async () => {
        const clientId = "e5e198164ca9473187d806fe04a420ba";
        const redirectUri = import.meta.env.REACT_APP_SPOTIFY_REDIRECT_URI || "http://localhost:5173/redirect";

        const scope = [
            "user-library-read",
            "playlist-read-private",
            "playlist-read-collaborative",
        ].join(" ");

        console.log("starting login");

        const codeVerifier = generateCodeVerifier();
        console.log("code verifier", codeVerifier);
        localStorage.setItem("spotify_code_verifier", codeVerifier);
        const codeChallenge = await generateCodeChallenge(codeVerifier);

        localStorage.setItem("spotify_code_verifier", codeVerifier);

        const authUrl = new URL("https://accounts.spotify.com/authorize");
        authUrl.search = new URLSearchParams({
            client_id: clientId,
            response_type: "code",
            redirect_uri: redirectUri,
            scope: scope,
            code_challenge_method: "S256",
            code_challenge: codeChallenge,
        }).toString();

        window.location.href = authUrl.toString();
    };

    const cleanUpURL = () => {
        window.history.replaceState({}, document.title, window.location.pathname);
    };

    const fetchLikedSongs = async () => {
        const token = localStorage.getItem("spotify_access_token");

        if (!token) {
            console.error("No Spotify token found!");
            return;
        }

        setProgress(0);
        setIsLoading(true);

        let allTracks = [];
        let nextUrl = "https://api.spotify.com/v1/me/tracks?limit=50"; // Fetch 50 songs per request
        let totalFetched = 0;

        while (nextUrl) {
            const response = await fetch(nextUrl, {
                headers: { Authorization: `Bearer ${token}` },
            });

            const data = await response.json();
            if (data.items) {
                allTracks = [...allTracks, ...data.items];
            }

            nextUrl = data.next; // If there are more tracks, continue to next page
            totalFetched += data.items.length;
            setProgress(totalFetched); // Update progress bar
            //console.log("progress", progress);  
        }

        setIsLoading(false);
        console.log("Liked Songs:", allTracks);
        return allTracks;
    };

    const fetchUserPlaylists = async () => {
        const token = localStorage.getItem("spotify_access_token");

        if (!token) {
            console.error("No Spotify token found!");
            return;
        }

        let allPlaylists = [];
        let nextUrl = "https://api.spotify.com/v1/me/playlists?limit=50"; // Fetch 50 playlists per request

        while (nextUrl) {
            const response = await fetch(nextUrl, {
                headers: { Authorization: `Bearer ${token}` },
            });

            const data = await response.json();
            if (data.items) {
                allPlaylists = [...allPlaylists, ...data.items];
            }

            nextUrl = data.next; // If more playlists exist, continue to next page
        }

        console.log("User Playlists:", allPlaylists);
        return allPlaylists;
    };

    const fetchPlaylistTracks = async (playlistId) => {
        const token = localStorage.getItem("spotify_access_token");

        if (!token) {
            console.error("No Spotify token found!");
            return;
        }

        let allTracks = [];
        let nextUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

        while (nextUrl) {
            const response = await fetch(nextUrl, {
                headers: { Authorization: `Bearer ${token}` },
            });

            const data = await response.json();
            if (data.items) {
                allTracks = [...allTracks, ...data.items];
            }

            nextUrl = data.next; // Fetch next set of tracks if available
        }

        console.log(`Tracks for Playlist ${playlistId}:`, allTracks);
        return allTracks;
    };

    const fetchAllUserSongs = async () => {
        const likedSongs = await fetchLikedSongs(); // Fetch Liked Songs
        //const playlists = await fetchUserPlaylists(); // Fetch User's Playlists

        let allSongs = [...likedSongs];

        // we are fetching liked songs only rn

        // Fetch tracks from all user playlists
        // for (let playlist of playlists) {
        //     const playlistTracks = await fetchPlaylistTracks(playlist.id);
        //     allSongs = [...allSongs, ...playlistTracks];
        // }

        console.log("All User Songs:", allSongs);
        setSpotifyAllSongs(allSongs);
        //return allSongs;
    };

    const logOut = () => {
        localStorage.removeItem("spotify_access_token");
        setGuideText("To start using Transporter, we need you to login to Spotify.");
        setHideSpotifyButton(false);
    }

    return (
        <>
            <h1>Transporter</h1>
            <h2>{guideText}</h2>
            {!hideSpotifyButton ? (
                <button onClick={handleLogin}>Login with Spotify</button>
            ) : (
                <>
                    {/* <button onClick={fetchSpotifyProfile}>Fetch Spotify Profile</button> */}
                    <button onClick={logOut}>Log Out</button>
                </>
            )}
            {isLoading && (
                <div>
                    <p>Fetched {Math.round(progress)} songs... </p>
                </div>
            )}
            {spotifyAllSongs.length > 0 && (
                <div>
                    <h3>All Songs:</h3>
                    <ul>
                        {spotifyAllSongs.map((song, index) => (
                            <li key={index}>
                                {song.track.name} by {song.track.artists.map(artist => artist.name).join(", ")}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </>
    );
}

export default App;
